"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

interface HelpItem {
  title: string;
  content: string;
}

const helpContent: Record<string, HelpItem[]> = {
  "/dashboard/blog": [
    {
      title: "Reviewing drafts",
      content:
        "Click any post to open the full preview. Read through the article for accuracy, tone, and flow. Check that vendor names and product details match reality. The content guard has already screened for safety issues — focus on industry accuracy.",
    },
    {
      title: "Image editing: Edit vs New",
      content:
        "Click any image to adjust it. Edit mode makes small changes to the existing image (brighten, remove an object, change a color). New mode generates a completely different image from a description. Use Edit for tweaks, New for replacements.",
    },
    {
      title: "Effective image prompts",
      content:
        "Keep Edit prompts simple — one change at a time. Good: \"brighter shadows\", \"remove the sign\", \"warmer tones\". Bad: \"create a new scene and remove the background\" (too many operations). For big changes, switch to New mode.",
    },
    {
      title: "When to approve vs reject",
      content:
        "Approve if the article accurately represents your work and would make a good impression on a potential client. Reject if the content is off-topic, contains factual errors you can't fix with image edits, or doesn't match your brand voice.",
    },
    {
      title: "Flagged posts",
      content:
        "Posts marked as flagged were caught by the content safety scanner. Expand them to see the specific issues. Common flags: pricing mentions, hallucinated contact info. You can still publish flagged posts after reviewing the concerns.",
    },
    {
      title: "Corrections persist",
      content:
        "When you use New mode to fix an editorial image (e.g., \"spray paint line, not brush\"), that correction applies to all future articles about the same vendor or material. You only need to correct it once.",
    },
  ],
  "/dashboard/media": [
    {
      title: "Writing good context notes",
      content:
        "List specific details, not marketing copy. Good: \"walnut slab countertop, brass bar sink, Texas Lightsmith, tile backsplash\". Bad: \"So many outstanding features in this beautiful kitchen\". The AI uses your details to generate accurate content.",
    },
    {
      title: "Using vendor hashtags",
      content:
        "Type # to tag a vendor (e.g., #crystal_cabinet_works). The vendor's website auto-links in generated blog articles. Add vendor URLs in Account → Vendors first.",
    },
    {
      title: "Inline deep links",
      content:
        "Paste vendor product URLs directly in the context note (e.g., https://thermador.com/wine-column). These become outbound links in the article, giving readers direct access to the product page.",
    },
    {
      title: "Quality scores",
      content:
        "The percentage on each asset indicates technical publishability. 90%+: hero quality. 70-89%: good, will be enhanced. Below 70%: rough, may be regenerated as an AI version. You can manually enhance any image during blog review.",
    },
  ],
  "/dashboard/capture": [
    {
      title: "What to upload",
      content:
        "Finished projects, in-progress work, material close-ups, vendor products — anything that tells the story of your work. Phone photos are fine. The system enhances them automatically.",
    },
    {
      title: "HEIC files",
      content:
        "iPhone photos in HEIC format are automatically converted to JPEG on upload. No action needed on your part.",
    },
    {
      title: "Upload frequency",
      content:
        "The content engine runs on fresh uploads. Upload regularly to keep blog posts diverse and relevant. The dashboard shows a freshness indicator — when it turns yellow, it's time to upload new content.",
    },
  ],
  "/dashboard": [
    {
      title: "Pipeline health",
      content:
        "Green = content flowing. Yellow = running low on fresh uploads. Red = pipeline will stall. Upload new photos to keep the content engine running.",
    },
    {
      title: "Content freshness",
      content:
        "Shows days since your last upload. Content quality depends on fresh material. After 14 days without uploads, the system warns that content is going stale.",
    },
    {
      title: "Suggested uploads",
      content:
        "These are topics mentioned in your articles that don't have a dedicated deep-dive post yet. Upload a focused photo of the suggested topic to generate a targeted article that auto-links from existing content.",
    },
  ],
  "/dashboard/account/vendors": [
    {
      title: "Setting up vendors",
      content:
        "Add each vendor or partner you work with. Include their website URL. When you tag them with #vendor_slug in a context note, their website automatically appears as an outbound link in generated articles.",
    },
    {
      title: "Vendor links in articles",
      content:
        "Each article includes up to 3 vendor links to avoid over-linking. If an asset has more than 3 vendors tagged, the system picks the most relevant. Deep links from context notes get priority over homepage URLs.",
    },
  ],
};

// Fallback for pages without specific help
const defaultHelp: HelpItem[] = [
  {
    title: "Need help?",
    content:
      "Navigate to a specific page to see contextual tips and guidance for that feature.",
  },
];

export function ContextualHelp() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  // Match the most specific path first
  const matchedPath = Object.keys(helpContent)
    .filter((path) => pathname === path || pathname.startsWith(path + "/"))
    .sort((a, b) => b.length - a.length)[0];

  const items = helpContent[matchedPath] || defaultHelp;

  return (
    <div className="border-t border-border">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-4 py-3 text-xs font-medium text-muted hover:text-foreground"
      >
        <span>Help & Tips</span>
        <span>{isOpen ? "▾" : "▸"}</span>
      </button>

      {isOpen && (
        <div className="px-4 pb-4">
          {items.map((item, i) => {
            const expanded = expandedIndex === i;
            return (
              <div key={i} className="border-b border-border last:border-0">
                <button
                  onClick={() => setExpandedIndex(expanded ? null : i)}
                  className="flex w-full items-center justify-between py-2 text-left text-[11px] font-medium text-foreground"
                >
                  {item.title}
                  <span className="text-[10px] text-muted">{expanded ? "▾" : "▸"}</span>
                </button>
                {expanded && (
                  <p className="pb-2 text-[11px] leading-relaxed text-muted">
                    {item.content}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
