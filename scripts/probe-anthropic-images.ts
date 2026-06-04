import Anthropic from "@anthropic-ai/sdk";
const a = new Anthropic();
const urls: [string, string][] = [
  ["website-screenshot", "https://assets.tracpost.com/sites/3db37450-72a3-4512-8094-9026c99a1191/branding/website-screenshot.png"],
  ["business_logo",     "https://assets.tracpost.com/sites/3db37450-72a3-4512-8094-9026c99a1191/branding/logo.png"],
  ["gbp_cover",         "https://assets.tracpost.com/sites/3db37450-72a3-4512-8094-9026c99a1191/media/DSC02287-04-08.jpg"],
];
(async () => {
  for (const [label, url] of urls) {
    process.stdout.write(`${label.padEnd(20)} … `);
    try {
      await a.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 32,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "url", url } },
          { type: "text", text: "Reply with just the word OK." },
        ]}],
      });
      console.log("OK");
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : String(e);
      console.log(`FAIL: ${m.slice(0, 220)}`);
    }
  }
})().catch((e) => { console.error(e); process.exit(1); });
