/**
 * Operator nudge templates — pre-canned help messages for stuck onboarding
 * subscribers. Operator picks one, optionally adds a custom note, and the
 * system sends an email + creates a persistent notification.
 *
 * Each template returns plain text body content — the email layout and
 * notification record are wrapped around it by the nudge endpoint.
 */

export type PlatformKey =
  | "instagram"
  | "facebook"
  | "gbp"
  | "linkedin"
  | "youtube"
  | "pinterest"
  | "tiktok"
  | "twitter"
  | "general";

export interface NudgeTemplate {
  key: string;
  platform: PlatformKey;
  label: string;
  subject: string;
  title: string;
  bodyHtml: string;
  notificationTitle: string;
  notificationBody: string;
}

export const NUDGE_TEMPLATES: NudgeTemplate[] = [
  {
    key: "tiktok_business_account",
    platform: "tiktok",
    label: "TikTok — needs Business account",
    subject: "Quick TikTok tip — switching to a Business account",
    title: "TikTok needs a Business account",
    bodyHtml: `
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 14px;">
        We noticed you got stuck on the TikTok step. The most common reason is the connected
        account is set to <strong>Personal</strong> — TikTok&apos;s API only allows publishing from
        Business accounts.
      </p>
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 8px;">
        Quick fix in the TikTok app:
      </p>
      <ol style="font-size: 15px; color: #4b5563; line-height: 1.7; margin: 0 0 14px; padding-left: 22px;">
        <li>Settings and privacy → Account</li>
        <li>Switch to Business account</li>
        <li>Pick the closest category to your business</li>
      </ol>
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0;">
        Once switched, retry the TikTok connection in your onboarding. It should sail through.
      </p>
    `,
    notificationTitle: "TikTok connection tip",
    notificationBody:
      "TikTok only allows publishing from Business accounts. Switch in TikTok app → Settings → Account → Switch to Business, then retry.",
  },
  {
    key: "instagram_needs_fb_page",
    platform: "instagram",
    label: "Instagram — needs FB Page link",
    subject: "Quick Instagram tip — linking to a Facebook Page",
    title: "Instagram needs to be linked to a Facebook Page",
    bodyHtml: `
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 14px;">
        Saw the Instagram step gave you trouble. Instagram&apos;s API requires the account to be
        a <strong>Business or Creator</strong> account AND linked to a Facebook Page you manage.
      </p>
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 8px;">
        Two-minute fix in the Instagram app:
      </p>
      <ol style="font-size: 15px; color: #4b5563; line-height: 1.7; margin: 0 0 14px; padding-left: 22px;">
        <li>Account type and tools → Switch to Professional account</li>
        <li>Choose Business (or Creator)</li>
        <li>Link a Facebook Page you manage (create one if needed)</li>
      </ol>
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0;">
        Retry the Instagram connection after that.
      </p>
    `,
    notificationTitle: "Instagram connection tip",
    notificationBody:
      "Instagram needs a Business/Creator account linked to a Facebook Page. Switch in Instagram app → Account type and tools, then retry.",
  },
  {
    key: "gbp_verified_manager",
    platform: "gbp",
    label: "Google Business — verification needed",
    subject: "Quick Google Business tip — manager verification",
    title: "Google Business needs you as a verified manager",
    bodyHtml: `
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 14px;">
        The Google Business step requires you to be a <strong>verified manager</strong> on the
        location you want to connect. If TracPost says &quot;no locations found&quot;, this is
        usually why.
      </p>
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 8px;">
        How to fix it:
      </p>
      <ol style="font-size: 15px; color: #4b5563; line-height: 1.7; margin: 0 0 14px; padding-left: 22px;">
        <li>Go to <a href="https://business.google.com" style="color: #1a1a1a;">business.google.com</a></li>
        <li>Pick the location → Users → Add manager</li>
        <li>If your verification is still pending, wait for the postcard or call code from Google</li>
      </ol>
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0;">
        Once verified, retry the Google connection in onboarding.
      </p>
    `,
    notificationTitle: "Google Business connection tip",
    notificationBody:
      "Google Business requires verified manager access. Add yourself at business.google.com, then retry the connection.",
  },
  {
    key: "linkedin_admin_role",
    platform: "linkedin",
    label: "LinkedIn — admin role needed",
    subject: "Quick LinkedIn tip — Company Page admin role",
    title: "LinkedIn needs Company Page admin role",
    bodyHtml: `
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 14px;">
        LinkedIn won&apos;t connect a personal profile — TracPost publishes to a
        <strong>Company Page</strong>, and you need <strong>Admin</strong> or
        <strong>Content Admin</strong> access on it.
      </p>
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 8px;">
        How to verify:
      </p>
      <ol style="font-size: 15px; color: #4b5563; line-height: 1.7; margin: 0 0 14px; padding-left: 22px;">
        <li>Open your Company Page on LinkedIn</li>
        <li>Settings → Manage admins</li>
        <li>If you&apos;re not listed, ask the existing admin to add you</li>
        <li>If no Company Page exists, create one — takes 2 minutes</li>
      </ol>
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0;">
        Once admin access is confirmed, retry the LinkedIn step.
      </p>
    `,
    notificationTitle: "LinkedIn connection tip",
    notificationBody:
      "LinkedIn requires Admin or Content Admin role on a Company Page. Verify in LinkedIn → Company Page → Settings → Manage admins.",
  },
  {
    key: "general_check_in",
    platform: "general",
    label: "General — friendly check-in",
    subject: "Just checking in on your TracPost onboarding",
    title: "Just checking in",
    bodyHtml: `
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 14px;">
        Saw your onboarding has been sitting for a bit and wanted to make sure nothing&apos;s
        blocking you. If you hit any friction connecting a platform, or have a question about
        what we&apos;re asking for, just reply to this email — we&apos;re here to help.
      </p>
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0;">
        If you&apos;d rather finish on a call, let us know a good time and we&apos;ll set one up.
      </p>
    `,
    notificationTitle: "We&apos;re here if you need help",
    notificationBody:
      "Hit any snag in onboarding? Reply to the support email or schedule a call — we&apos;ll walk you through it.",
  },
];

export function getNudgeTemplate(key: string): NudgeTemplate | undefined {
  return NUDGE_TEMPLATES.find((t) => t.key === key);
}
