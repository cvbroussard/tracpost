import { sql } from "@/lib/db";
import { decrypt } from "@/lib/crypto";

async function run() {
  const siteId = "a2df5b78-a607-4633-aa09-8e116e2ccfb2"; // EK

  const [acct] = await sql`
    SELECT sa.account_id, sa.access_token_encrypted
    FROM social_accounts sa
    JOIN site_social_links ssl ON ssl.social_account_id = sa.id
    WHERE ssl.site_id = ${siteId} AND sa.platform = 'gbp' AND sa.status = 'active'
    LIMIT 1
  `;

  if (!acct) { console.log("No account"); return; }

  const token = decrypt(acct.access_token_encrypted as string);
  const loc = acct.account_id as string;

  console.log("Testing EK full push:", loc);

  const tests = [
    { mask: "title", body: { title: "Epicurious Kitchens" } },
    { mask: "profile.description", body: { profile: { description: "Custom kitchen design and renovation for serious home cooks in Greater Pittsburgh." } } },
    { mask: "phoneNumbers", body: { phoneNumbers: { primaryPhone: "+14125021001" } } },
    { mask: "websiteUri", body: { websiteUri: "https://epicuriouskitchens.com" } },
    { mask: "regularHours", body: { regularHours: { periods: [
      { openDay: "MONDAY", openTime: { hours: 7, minutes: 0 }, closeDay: "MONDAY", closeTime: { hours: 19, minutes: 0 } },
      { openDay: "TUESDAY", openTime: { hours: 7, minutes: 0 }, closeDay: "TUESDAY", closeTime: { hours: 19, minutes: 0 } },
      { openDay: "WEDNESDAY", openTime: { hours: 7, minutes: 0 }, closeDay: "WEDNESDAY", closeTime: { hours: 19, minutes: 0 } },
      { openDay: "THURSDAY", openTime: { hours: 7, minutes: 0 }, closeDay: "THURSDAY", closeTime: { hours: 19, minutes: 0 } },
      { openDay: "FRIDAY", openTime: { hours: 7, minutes: 0 }, closeDay: "FRIDAY", closeTime: { hours: 19, minutes: 0 } },
    ] } } },
    { mask: "openInfo", body: { openInfo: { openingDate: { year: 2018, month: 1, day: 1 }, status: "OPEN" } } },
  ];

  // Test each individually
  for (const t of tests) {
    const res = await fetch(`https://mybusinessbusinessinformation.googleapis.com/v1/${loc}?updateMask=${t.mask}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(t.body),
    });
    if (res.ok) {
      console.log(`  ✓ ${t.mask}`);
    } else {
      const err = await res.text();
      console.log(`  ✗ ${t.mask} (${res.status}): ${err.slice(0, 150)}`);
    }
  }

  // Test all combined
  console.log("\n--- All fields combined ---");
  const allMask = tests.map(t => t.mask).join(",");
  const allBody: Record<string, unknown> = {};
  for (const t of tests) Object.assign(allBody, t.body);
  const allRes = await fetch(`https://mybusinessbusinessinformation.googleapis.com/v1/${loc}?updateMask=${allMask}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(allBody),
  });
  if (allRes.ok) {
    console.log("  ✓ All fields pushed successfully");
  } else {
    const err = await allRes.text();
    console.log(`  ✗ Combined (${allRes.status}): ${err.slice(0, 200)}`);
  }

  // Test categories push
  console.log("\n--- Categories ---");
  const cats = await sql`
    SELECT sgc.gcid, sgc.is_primary, gc.name
    FROM site_gbp_categories sgc
    JOIN gbp_categories gc ON gc.gcid = sgc.gcid
    WHERE sgc.site_id = ${siteId}
    ORDER BY sgc.is_primary DESC
  `;
  if (cats.length > 0) {
    const primary = cats.find(c => c.is_primary);
    const additional = cats.filter(c => !c.is_primary);
    const catBody = {
      categories: {
        primaryCategory: primary ? { categoryId: primary.gcid, displayName: primary.name } : undefined,
        additionalCategories: additional.map(c => ({ categoryId: c.gcid, displayName: c.name })),
      },
    };
    const catRes = await fetch(`https://mybusinessbusinessinformation.googleapis.com/v1/${loc}?updateMask=categories`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(catBody),
    });
    if (catRes.ok) {
      console.log("  ✓ Categories pushed");
    } else {
      const err = await catRes.text();
      console.log(`  ✗ Categories (${catRes.status}): ${err.slice(0, 200)}`);
    }
  } else {
    console.log("  No categories to push");
  }
}

run().catch(console.error);
