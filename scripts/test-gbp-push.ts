/**
 * Test GBP profile push field by field.
 * Run: npx tsx scripts/test-gbp-push.js
 */
import { sql } from "@/lib/db";
import { decrypt } from "@/lib/crypto";

const BIZ_INFO_API = "https://mybusinessbusinessinformation.googleapis.com/v1";

async function testPush(token: string, locationPath: string, updateMask: string, body: Record<string, unknown>) {
  const url = `${BIZ_INFO_API}/${locationPath}?updateMask=${updateMask}`;
  console.log(`\n  PATCH ${updateMask}`);
  console.log(`  Body: ${JSON.stringify(body).slice(0, 200)}`);

  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (res.ok) {
    console.log(`  ✓ ${res.status} OK`);
  } else {
    const err = await res.text();
    console.log(`  ✗ ${res.status}: ${err.slice(0, 200)}`);
  }
  return res.ok;
}

async function run() {
  const siteId = process.argv[2] || "3db37450-72a3-4512-8094-9026c99a1191"; // B2

  const [acct] = await sql`
    SELECT sa.account_id, sa.access_token_encrypted
    FROM social_accounts sa
    JOIN site_social_links ssl ON ssl.social_account_id = sa.id
    WHERE ssl.site_id = ${siteId} AND sa.platform = 'gbp' AND sa.status = 'active'
    LIMIT 1
  `;

  if (!acct) { console.log("No GBP account found"); return; }

  const token = decrypt(acct.access_token_encrypted as string);
  const locationPath = acct.account_id as string;

  console.log(`Testing push to ${locationPath}`);

  const tests = [
    { mask: "title", body: { title: "Bsquared Construction, LLC" } },
    { mask: "profile.description", body: { profile: { description: "Your home is your life -- we're here to give it the makeover that you've been dreaming of." } } },
    { mask: "phoneNumbers", body: { phoneNumbers: { primaryPhone: "+14125921232" } } },
    { mask: "websiteUri", body: { websiteUri: "https://b2construct.com/" } },
    { mask: "regularHours", body: { regularHours: { periods: [
      { openDay: "MONDAY", openTime: { hours: 7, minutes: 0 }, closeDay: "MONDAY", closeTime: { hours: 19, minutes: 0 } },
    ] } } },
    { mask: "openInfo", body: { openInfo: { openingDate: { year: 2014, month: 1, day: 1 }, status: "OPEN" } } },
  ];

  for (const t of tests) {
    await testPush(token, locationPath, t.mask, t.body);
  }

  console.log("\n--- All fields combined ---");
  const allMask = tests.map(t => t.mask).join(",");
  const allBody: Record<string, unknown> = {};
  for (const t of tests) Object.assign(allBody, t.body);
  await testPush(token, locationPath, allMask, allBody);
}

run().catch(console.error);
