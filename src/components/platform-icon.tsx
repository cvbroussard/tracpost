/**
 * Branded social platform icons. Inline SVG with platform brand colors.
 */

interface Props {
  platform: string;
  size?: number;
  className?: string;
}

export function PlatformIcon({ platform, size = 16, className = "" }: Props) {
  const s = { width: size, height: size };

  switch (platform) {
    case "instagram":
      return (
        <svg viewBox="0 0 24 24" {...s} className={className}>
          <defs>
            <radialGradient id="igGrad" cx="0.3" cy="1.1" r="1.2">
              <stop offset="0" stopColor="#FFD600" />
              <stop offset="0.25" stopColor="#FF7A00" />
              <stop offset="0.5" stopColor="#FF0069" />
              <stop offset="0.75" stopColor="#D300C5" />
              <stop offset="1" stopColor="#7638FA" />
            </radialGradient>
          </defs>
          <rect x="2" y="2" width="20" height="20" rx="5" fill="url(#igGrad)" />
          <rect x="6" y="6" width="12" height="12" rx="4" fill="none" stroke="#fff" strokeWidth="1.7" />
          <circle cx="12" cy="12" r="3" fill="none" stroke="#fff" strokeWidth="1.7" />
          <circle cx="17" cy="7" r="1.1" fill="#fff" />
        </svg>
      );

    case "facebook":
      return (
        <svg viewBox="0 0 24 24" {...s} className={className}>
          <rect width="24" height="24" rx="5" fill="#1877F2" />
          <path d="M15.5 12.5h-2.4V20h-3v-7.5H8.5V10h1.6V8.3c0-2 1.2-3.3 3.5-3.3h1.9v2.7h-1.3c-.7 0-1 .3-1 1V10h2.4l-.3 2.5z" fill="#fff" />
        </svg>
      );

    case "gbp":
    case "google":
      return (
        <svg viewBox="0 0 24 24" {...s} className={className}>
          <rect width="24" height="24" rx="5" fill="#fff" stroke="#dadce0" strokeWidth="0.5" />
          <path d="M19.6 12.2c0-.6-.05-1-.16-1.5h-7.2v2.7h4.2c-.08.7-.55 1.7-1.6 2.4l-.01.1 2.3 1.8.16.02c1.5-1.4 2.3-3.4 2.3-5.5z" fill="#4285F4" />
          <path d="M12.24 19.6c2.1 0 3.9-.7 5.2-1.9l-2.5-1.9c-.66.45-1.5.78-2.7.78-2 0-3.7-1.3-4.4-3.2l-.09.01-2.4 1.85-.04.1c1.3 2.6 4 4.3 7 4.3z" fill="#34A853" />
          <path d="M7.84 13.4c-.18-.5-.28-1.1-.28-1.7s.1-1.2.27-1.7l-.01-.12-2.4-1.86-.08.04c-.55 1.1-.86 2.3-.86 3.65 0 1.35.31 2.55.86 3.65l2.5-1.96z" fill="#FBBC05" />
          <path d="M12.24 6.8c1.4 0 2.4.6 2.95 1.1l2.16-2.1c-1.3-1.2-3-2-5.1-2-3 0-5.7 1.7-7 4.3l2.5 1.95c.7-1.95 2.4-3.25 4.5-3.25z" fill="#EA4335" />
        </svg>
      );

    case "linkedin":
      return (
        <svg viewBox="0 0 24 24" {...s} className={className}>
          <rect width="24" height="24" rx="3" fill="#0A66C2" />
          <path d="M7.6 9.4h-2.4V18h2.4V9.4zm-1.2-3.7c-.8 0-1.4.6-1.4 1.4 0 .8.6 1.4 1.4 1.4.8 0 1.4-.6 1.4-1.4 0-.8-.6-1.4-1.4-1.4zM18.8 18h-2.4v-4.2c0-1-.4-1.7-1.3-1.7-.7 0-1.1.5-1.3 1-.07.16-.09.39-.09.61V18H11.3s.03-7.4 0-8.6h2.4v1.2c.32-.5.89-1.2 2.18-1.2 1.6 0 2.92 1 2.92 3.3V18z" fill="#fff" />
        </svg>
      );

    case "youtube":
      return (
        <svg viewBox="0 0 24 24" {...s} className={className}>
          <rect x="2" y="5" width="20" height="14" rx="3" fill="#FF0000" />
          <path d="M10 9l5 3-5 3V9z" fill="#fff" />
        </svg>
      );

    case "tiktok":
      return (
        <svg viewBox="0 0 24 24" {...s} className={className}>
          <rect width="24" height="24" rx="5" fill="#000" />
          <path d="M16.5 7.4c-1-.3-1.7-1-2-1.9h-2.2v8.5c0 1-.8 1.8-1.8 1.8s-1.8-.8-1.8-1.8.8-1.8 1.8-1.8c.2 0 .3 0 .5.05V10c-.16-.02-.33-.04-.5-.04-2.2 0-4 1.8-4 4 0 2.2 1.8 4 4 4s4-1.8 4-4V9.7c.8.55 1.7.9 2.7.9V8.3c-.4 0-.5-.4-.7-.9z" fill="#25F4EE" opacity="0.9" />
          <path d="M16.8 7.5c-1-.3-1.8-1-2.1-1.95h-2.2v8.5c0 1-.8 1.8-1.8 1.8s-1.8-.8-1.8-1.8.8-1.8 1.8-1.8c.2 0 .3 0 .5.05V10.1c-.16-.02-.33-.04-.5-.04-2.2 0-4 1.8-4 4 0 2.2 1.8 4 4 4s4-1.8 4-4V9.8c.8.55 1.8.9 2.8.9V8.4c-.4 0-.5-.4-.7-.9z" fill="#fff" />
        </svg>
      );

    case "twitter":
    case "x":
      return (
        <svg viewBox="0 0 24 24" {...s} className={className}>
          <rect width="24" height="24" rx="5" fill="#000" />
          <path d="M16.7 6h2l-4.4 5 5.2 7h-4.1l-3.2-4.2L8.3 18H6.3l4.7-5.4L6 6h4.2l2.9 3.85L16.7 6zm-.7 10.7h1.1l-7-9.3h-1.2l7.1 9.3z" fill="#fff" />
        </svg>
      );

    case "pinterest":
      return (
        <svg viewBox="0 0 24 24" {...s} className={className}>
          <circle cx="12" cy="12" r="10" fill="#E60023" />
          <path d="M12.2 6.5c-3 0-4.7 2-4.7 4 0 1.2.5 2.3 1.4 2.7.15.06.3 0 .35-.15.04-.13.13-.5.16-.65.05-.2.04-.27-.1-.45-.34-.4-.55-.92-.55-1.65 0-2.13 1.6-4 4.16-4 2.27 0 3.5 1.4 3.5 3.25 0 2.45-1.08 4.5-2.7 4.5-.88 0-1.55-.74-1.34-1.65.26-1.08.76-2.25.76-3.03 0-.7-.38-1.28-1.16-1.28-.92 0-1.66.95-1.66 2.22 0 .81.27 1.36.27 1.36s-.93 3.94-1.1 4.66c-.3 1.3.04 3.16.04 3.18.04.06.13.07.18.03.04-.04.97-1.18 1.27-2.43.08-.36.5-1.97.5-1.97.25.48.98.9 1.76.9 2.32 0 3.9-2.1 3.9-4.93 0-2.13-1.81-4.13-4.56-4.13z" fill="#fff" />
        </svg>
      );

    default:
      return (
        <svg viewBox="0 0 24 24" {...s} className={className}>
          <rect width="24" height="24" rx="5" fill="#94a3b8" />
          <text x="12" y="16" textAnchor="middle" fill="#fff" fontSize="12" fontWeight="600">
            {platform.charAt(0).toUpperCase()}
          </text>
        </svg>
      );
  }
}
