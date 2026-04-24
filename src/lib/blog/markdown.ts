/**
 * Markdown→HTML converter for blog body content.
 * Shared between public blog renderer and dashboard preview.
 */
export function markdownToHtml(md: string): string {
  return md
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, src) => {
      return `<img src="${src}" alt="${alt}" loading="lazy" width="800" height="450" decoding="async" style="aspect-ratio:16/9;object-fit:cover;">`;
    })
    .replace(/^#### (.+)$/gm, "<h5>$1</h5>")
    .replace(/^### (.+)$/gm, "<h4>$1</h4>")
    .replace(/^## (.+)$/gm, "<h3>$1</h3>")
    .replace(/^# (.+)$/gm, "<h2>$1</h2>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\[(.+?)\]\((https?:\/\/.+?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`)
    .split(/\n\n+/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      if (trimmed.startsWith("<h") || trimmed.startsWith("<ul") || trimmed.startsWith("<img")) return trimmed;
      return `<p>${trimmed.replace(/\n/g, "<br>")}</p>`;
    })
    .join("\n");
}

/**
 * Blog prose CSS for dashboard preview.
 * Adapted from the public blog layout to work inside the dashboard chrome.
 */
export const blogProseStyles = `
  .preview-prose {
    font-size: 16px;
    line-height: 1.7;
  }
  .preview-prose h1, .preview-prose h2, .preview-prose h3 {
    font-weight: 600;
    margin-top: 1.5em;
    margin-bottom: 0.5em;
  }
  .preview-prose h2 { font-size: 1.3em; }
  .preview-prose h3 { font-size: 1.15em; }
  .preview-prose h4 { font-size: 1.05em; }
  .preview-prose h5 { font-size: 1em; }
  .preview-prose p { margin-bottom: 1.25em; }
  .preview-prose a { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
  .preview-prose a:hover { opacity: 0.8; }
  .preview-prose strong { font-weight: 600; }
  .preview-prose ul, .preview-prose ol { margin-bottom: 1.25em; padding-left: 1.5em; }
  .preview-prose li { margin-bottom: 0.4em; }
  .preview-prose img { width: 100%; border-radius: 8px; margin: 1.5em 0; }
  .preview-prose blockquote {
    border-left: 3px solid var(--border);
    padding-left: 1em;
    margin: 1.5em 0;
    color: var(--muted);
    font-style: italic;
  }
`;
