import { sql } from "@/lib/db";

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default";
}

interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * Send a push notification to all registered devices for a subscriber.
 */
export async function sendPushNotification(
  subscriberId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  const tokens = await sql`
    SELECT id, token FROM push_tokens
    WHERE subscriber_id = ${subscriberId}
  `;

  if (tokens.length === 0) return;

  const messages: ExpoPushMessage[] = tokens.map((t) => ({
    to: t.token,
    title,
    body,
    data,
    sound: "default" as const,
  }));

  // Expo Push API accepts batches of up to 100
  const chunks: ExpoPushMessage[][] = [];
  for (let i = 0; i < messages.length; i += 100) {
    chunks.push(messages.slice(i, i + 100));
  }

  for (const chunk of chunks) {
    try {
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(chunk),
      });

      if (!res.ok) {
        console.error(
          `Expo Push API error: ${res.status} ${await res.text()}`
        );
        continue;
      }

      const result = await res.json();
      const tickets: ExpoPushTicket[] = result.data ?? [];

      // Clean up invalid tokens
      const tokensToDelete: string[] = [];
      for (let i = 0; i < tickets.length; i++) {
        const ticket = tickets[i];
        if (
          ticket.status === "error" &&
          ticket.details?.error === "DeviceNotRegistered"
        ) {
          tokensToDelete.push(chunk[i].to);
        }
      }

      if (tokensToDelete.length > 0) {
        await sql`
          DELETE FROM push_tokens
          WHERE token = ANY(${tokensToDelete})
        `;
        console.log(
          `Cleaned up ${tokensToDelete.length} invalid push token(s)`
        );
      }
    } catch (err) {
      console.error("Failed to send push notifications:", err);
    }
  }
}
