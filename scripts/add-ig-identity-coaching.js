/**
 * Add IG identity-authenticity coaching nodes to the meta walkthrough.
 *
 * Adds three new nodes to coaching_nodes (platform=meta):
 *   - q_personal_ig (question): "Do you have a personal IG?"
 *   - i_ig_recruit_verifier (instruction): "You'll need a 2nd person to anchor verification"
 *   - i_ig_self_verify (instruction): "Use your own identity for the verification"
 *
 * Idempotent: re-running updates the content but doesn't duplicate.
 *
 * Does NOT auto-wire the graph — leaves the routing edits to the operator
 * via /admin/coaching/meta. After running, open the admin UI and:
 *   1. Edit your "do you have a Business IG?" question's NO branch to
 *      route to q_personal_ig instead of i_create_instagram
 *   2. q_personal_ig YES routes to i_ig_recruit_verifier
 *   3. q_personal_ig NO  routes to i_ig_self_verify
 *   4. Both i_ig_* nodes' "next" should point to i_create_instagram
 *   5. Optionally: edit i_create_instagram body to add the closing
 *      identity-reinforcement line (printed below for reference)
 *
 * Usage: node scripts/add-ig-identity-coaching.js
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL);

const NODES = [
  {
    id: "q_personal_ig",
    type: "question",
    position: 145,
    content: {
      question: "Do you personally have an Instagram account — even one you don't use much?",
      help:
        "This includes any Instagram account where you've previously taken a selfie verification, even years ago. " +
        "Family photos, an old account from college, anything. We're checking whether your face is already registered " +
        "with Instagram — that determines how we'll create the business account.",
      options: [
        { label: "Yes, I have (or had) a personal Instagram", next: "i_ig_recruit_verifier" },
        { label: "No, I've never had an Instagram account", next: "i_ig_self_verify" },
      ],
    },
  },

  {
    id: "i_ig_recruit_verifier",
    type: "instruction",
    position: 146,
    content: {
      title: "You'll need a second person to anchor the verification",
      body:
        "Instagram uses facial recognition during account creation. Because you already have a personal Instagram " +
        "account, your face is registered — Instagram will reject a second account that tries to use the same face, " +
        "and there's no appeal once it's denied.\n\n" +
        "This isn't something TracPost can work around. It's a structural Instagram rule. The good news: it's a " +
        "one-time speed bump, not an ongoing limitation.\n\n" +
        "Find someone you trust who does NOT have an Instagram account, OR who is willing to use their identity to " +
        "anchor a new one. Common choices: a spouse or family member who isn't on Instagram, an employee or business " +
        "partner, an adult child who hasn't set up an Instagram.\n\n" +
        "That person handles only the account creation and selfie verification step. After the account exists, you " +
        "take over — convert it to a Business account, link it to your Facebook Page, set the bio and avatar to your " +
        "business, and operate it normally. The recruited person doesn't post, doesn't manage it, doesn't see anything " +
        "day-to-day.\n\n" +
        "What they should know going in: if Instagram ever re-challenges the account months later (it happens " +
        "occasionally), they'll need to do another selfie verification. So pick someone you'll have ongoing access " +
        "to, not a one-time favor.",
      bullets: [
        "The recruited person uses THEIR real legal name and THEIR real selfie when prompted",
        "Their identity stays on the account's verification record permanently (not visible publicly after Business conversion)",
        "You take operational control after creation — bio, posts, links, business conversion all handled by you",
        "Re-verification challenges months later require the same person's face again — choose someone you can reach",
        "This restriction only applies to NEW Instagram accounts. If you already have a Business Instagram, go back and answer 'yes' to the previous question.",
      ],
      next: "i_create_instagram",
    },
  },

  {
    id: "i_ig_self_verify",
    type: "instruction",
    position: 147,
    content: {
      title: "Use your own identity for the verification",
      body:
        "Because you don't have any existing Instagram account, your face is fresh to Instagram's identity system. " +
        "You can — and should — use your own real legal name and a real selfie when prompted during account creation.\n\n" +
        "Set the name field to your real name (not the business name). The business name lives in the @handle and the " +
        "bio — Instagram expects the 'name' field to be a person.\n\n" +
        "Get this step right the first time. If Instagram disables the account at verification, the disable is " +
        "permanent and unappealable, and your face is now spent on a failed account, putting you in the " +
        "recruit-a-second-person situation we just avoided.",
      bullets: [
        "Your real legal name in the name field — not the business name",
        "The @handle (your username) is where the business name goes",
        "Real selfie of your actual face when prompted",
        "This is your one-time chance to anchor a business IG yourself — don't rush it",
      ],
      next: "i_create_instagram",
    },
  },
];

const I_CREATE_INSTAGRAM_CLOSING_LINE =
  "Whichever path landed you at this step (your own identity or a recruited verifier), the person who completes " +
  "the creation must be the same person whose name is in the name field and whose face appears in the selfie. " +
  "Don't switch identities mid-process.";

async function main() {
  console.log("→ Inspecting current i_create_instagram content...");
  const [existing] = await sql`
    SELECT content FROM coaching_nodes
    WHERE platform = 'meta' AND id = 'i_create_instagram'
  `;

  if (!existing) {
    console.log("  ⚠ i_create_instagram not found — script will still add the new nodes,");
    console.log("    but you'll need to wire them to your equivalent create-IG node manually.");
  } else {
    const body = existing.content?.body || "";
    console.log("  Current body (first 200 chars):");
    console.log("  ", body.slice(0, 200) + (body.length > 200 ? "..." : ""));
    console.log("");
    console.log("  Suggested closing line to append (for identity reinforcement):");
    console.log("  ", I_CREATE_INSTAGRAM_CLOSING_LINE);
    console.log("");
    console.log("  → Not auto-modifying body. Edit via /admin/coaching/meta if you want to add it.");
  }

  console.log("");
  console.log("→ Upserting 3 new nodes...");
  for (const node of NODES) {
    await sql`
      INSERT INTO coaching_nodes (platform, id, type, content, position)
      VALUES ('meta', ${node.id}, ${node.type}, ${JSON.stringify(node.content)}::jsonb, ${node.position})
      ON CONFLICT (platform, id) DO UPDATE SET
        type = EXCLUDED.type,
        content = EXCLUDED.content,
        position = EXCLUDED.position,
        updated_at = NOW()
    `;
    console.log(`  ✓ ${node.id} (${node.type})`);
  }

  console.log("");
  console.log("✅ Nodes added. Next steps in /admin/coaching/meta:");
  console.log("   1. Edit your IG-presence question (e.g. q_ig_business) so its NO branch routes to q_personal_ig");
  console.log("   2. Verify q_personal_ig options:");
  console.log("        YES → i_ig_recruit_verifier");
  console.log("        NO  → i_ig_self_verify");
  console.log("   3. Verify both i_ig_* nodes' 'next' = i_create_instagram (default — already set)");
  console.log("   4. Optionally: append the identity-reinforcement closing line to i_create_instagram body");
  console.log("");
  console.log("Walk the wizard end-to-end after wiring to confirm no orphans and the graph still validates.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("✗ Failed:", err);
    process.exit(1);
  });
