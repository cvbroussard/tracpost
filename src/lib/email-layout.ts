/**
 * Shared HTML layout for transactional emails.
 *
 * Renders Mercury-style chrome: centered logo, body slot, reply invitation,
 * italic team sign-off, divider, compliance footer. Use for any user-facing
 * email so the brand reads consistently.
 */

const COMPANY_NAME = "TracPost";
const PARENT_COMPANY = "Eppux LLC";
const COMPANY_ADDRESS = process.env.TRACPOST_MAILING_ADDRESS || "Pittsburgh, PA";
const SUPPORT_EMAIL = "support@tracpost.com";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://tracpost.com";
const LOGO_URL = `${APP_URL}/icon.png`;

const SOCIAL_LINKS = [
  { label: "X", url: "https://x.com/tracpost", svg: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M18.244 2H21.5l-7.5 8.575L23 22h-6.97l-5.46-7.13L4.3 22H1.04l8.04-9.19L1 2h7.16l4.93 6.52L18.244 2Zm-1.22 18h1.834L7.06 4H5.094l11.93 16Z"/></svg>` },
  { label: "LinkedIn", url: "https://linkedin.com/company/tracpost", svg: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.36V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12Zm1.78 13.02H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45C23.2 24 24 23.23 24 22.28V1.72C24 .77 23.2 0 22.22 0Z"/></svg>` },
  { label: "Instagram", url: "https://instagram.com/tracpost", svg: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.71 3.71 0 0 1-1.38-.9 3.71 3.71 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16ZM12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63a5.86 5.86 0 0 0-2.13 1.38A5.86 5.86 0 0 0 .63 4.14C.33 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.32.78.74 1.45 1.38 2.13a5.86 5.86 0 0 0 2.13 1.38c.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56.78-.32 1.45-.74 2.13-1.38a5.86 5.86 0 0 0 1.38-2.13c.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91a5.86 5.86 0 0 0-1.38-2.13A5.86 5.86 0 0 0 19.86.63c-.76-.3-1.64-.5-2.91-.56C15.67.01 15.26 0 12 0Zm0 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.4-11.85a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88Z"/></svg>` },
];

interface LayoutOpts {
  preheader?: string;
  body: string;
  invitationLine?: string;
  signoff?: string;
}

export function emailLayout({
  preheader,
  body,
  invitationLine = "If you have any questions, just reply to this email.",
  signoff = "Thanks,",
}: LayoutOpts): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${COMPANY_NAME}</title>
  </head>
  <body style="margin: 0; padding: 0; background: #f7f7f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, system-ui, sans-serif; color: #1a1a1a; -webkit-font-smoothing: antialiased;">
    ${preheader ? `<div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">${preheader}</div>` : ""}
    <div style="max-width: 560px; margin: 0 auto; padding: 40px 20px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <img src="${LOGO_URL}" width="40" height="40" alt="${COMPANY_NAME}" style="display: inline-block; border-radius: 8px;" />
        <div style="font-size: 14px; font-weight: 600; letter-spacing: 0.04em; color: #1a1a1a; margin-top: 8px;">
          ${COMPANY_NAME.toUpperCase()}
        </div>
      </div>

      <div style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 36px 32px;">
        ${body}

        <p style="font-size: 14px; color: #4b5563; line-height: 1.6; margin: 28px 0 0;">
          ${invitationLine}
        </p>

        <p style="font-size: 14px; color: #4b5563; line-height: 1.6; margin: 18px 0 0;">
          ${signoff}<br />
          <em style="color: #6b7280;">The ${COMPANY_NAME} team</em>
        </p>
      </div>

      <div style="border-top: 1px solid #e5e7eb; margin: 32px 0 16px;"></div>

      <div style="font-size: 13px; color: #6b7280; line-height: 1.6; text-align: center;">
        <div style="font-weight: 500; color: #4b5563;">Sent with care from ${COMPANY_NAME}</div>
        <div style="margin-top: 14px;">
          ${SOCIAL_LINKS.map(
            (s) => `<a href="${s.url}" style="display: inline-block; margin: 0 6px; color: #9ca3af; text-decoration: none;" aria-label="${s.label}">${s.svg}</a>`
          ).join("")}
        </div>
        <div style="margin-top: 12px;">
          <a href="mailto:${SUPPORT_EMAIL}" style="color: #6b7280; text-decoration: none;">${SUPPORT_EMAIL}</a>
          &nbsp;·&nbsp;
          <a href="${APP_URL}" style="color: #6b7280; text-decoration: none;">tracpost.com</a>
        </div>
      </div>

      <div style="font-size: 11px; color: #b0b8c4; line-height: 1.5; text-align: center; margin-top: 18px;">
        ${COMPANY_NAME} is operated by ${PARENT_COMPANY} · ${COMPANY_ADDRESS}
      </div>
    </div>
  </body>
</html>`;
}

interface CtaOpts {
  href: string;
  label: string;
}

export function ctaButton({ href, label }: CtaOpts): string {
  return `<div style="text-align: center; margin: 28px 0 8px;">
    <a href="${href}" style="display: inline-block; background: #1a1a1a; color: #ffffff; padding: 13px 28px; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 999px; line-height: 1;">
      ${label}
    </a>
  </div>`;
}
