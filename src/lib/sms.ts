/**
 * SMS service via AWS SNS (transactional).
 *
 * No A2P 10DLC campaign registration required for transactional messages.
 * Uses the same AWS credentials as Rekognition.
 *
 * Env: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION
 */
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

let client: SNSClient | null = null;

function getClient(): SNSClient {
  if (!client) {
    client = new SNSClient({
      region: process.env.AWS_REGION || "us-east-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
      },
    });
  }
  return client;
}

export async function sendSms(to: string, body: string): Promise<boolean> {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.log(`[SMS] To: ${to} | Body: ${body}`);
    return true;
  }

  try {
    const sns = getClient();
    await sns.send(new PublishCommand({
      PhoneNumber: to,
      Message: body,
      MessageAttributes: {
        "AWS.SNS.SMS.SMSType": {
          DataType: "String",
          StringValue: "Transactional",
        },
      },
    }));
    return true;
  } catch (err) {
    console.error("SNS SMS error:", err instanceof Error ? err.message : err);
    return false;
  }
}
