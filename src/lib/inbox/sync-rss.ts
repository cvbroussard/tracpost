import { sql } from "@/lib/db";

interface RssFeedItem {
  title: string;
  link: string;
  description?: string;
  pubDate?: string;
  guid?: string;
  imageUrl?: string;
}

/**
 * Sync RSS feeds for a site — poll active feeds, create media_assets
 * for new items, update last_polled / last_item_id.
 */
export async function syncRssFeeds(siteId: string): Promise<number> {
  const feeds = await sql`
    SELECT id, feed_url, feed_name, last_item_id
    FROM rss_feeds
    WHERE business_id = ${siteId} AND is_active = true
  `;

  let itemsCreated = 0;

  for (const feed of feeds) {
    try {
      const items = await fetchRssFeed(feed.feed_url as string);
      if (items.length === 0) continue;

      const lastItemId = feed.last_item_id as string | null;
      let newLastItemId = lastItemId;

      for (const item of items) {
        const itemId = item.guid || item.link;
        if (!itemId) continue;

        // Stop at the last known item
        if (lastItemId && itemId === lastItemId) break;

        // Track the newest item id
        if (!newLastItemId || items.indexOf(item) === 0) {
          newLastItemId = itemId;
        }

        // Check if we already have this item
        const [existing] = await sql`
          SELECT id FROM media_assets
          WHERE business_id = ${siteId} AND source = 'rss'
            AND metadata->>'source_url' = ${item.link}
        `;
        if (existing) continue;

        // Create media_asset for the RSS item
        const metadata = JSON.stringify({
          source_url: item.link,
          source_title: item.title,
          source_excerpt: item.description?.slice(0, 500),
          source_image: item.imageUrl,
          feed_name: feed.feed_name || feed.feed_url,
          feed_id: feed.id,
          pub_date: item.pubDate,
        });

        await sql`
          INSERT INTO media_assets (business_id, source, media_type, processing_stage, context_note, metadata, created_at)
          VALUES (
            ${siteId},
            'rss',
            'link',
            'onboarded',
            ${`[RSS] ${item.title}`},
            ${metadata}::jsonb,
            NOW()
          )
        `;
        itemsCreated++;
      }

      // Update feed polling state
      await sql`
        UPDATE rss_feeds
        SET last_polled = NOW(),
            last_item_id = ${newLastItemId}
        WHERE id = ${feed.id}
      `;
    } catch (err) {
      console.error(`RSS sync failed for feed ${feed.feed_url}:`, err instanceof Error ? err.message : err);
    }
  }

  return itemsCreated;
}

/**
 * Parse an RSS/Atom feed from a URL.
 * Returns items in feed order (newest first typically).
 */
async function fetchRssFeed(feedUrl: string): Promise<RssFeedItem[]> {
  const res = await fetch(feedUrl, {
    headers: { "User-Agent": "Tracpost/1.0 RSS Reader" },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(`RSS fetch failed: ${res.status} ${res.statusText}`);
  }

  const xml = await res.text();
  return parseRssXml(xml);
}

/**
 * Minimal RSS/Atom XML parser using regex.
 * Handles RSS 2.0 <item> and Atom <entry> formats.
 */
function parseRssXml(xml: string): RssFeedItem[] {
  const items: RssFeedItem[] = [];

  // Try RSS 2.0 format
  const rssItems = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  for (const itemXml of rssItems) {
    items.push({
      title: extractTag(itemXml, "title"),
      link: extractTag(itemXml, "link") || extractAttr(itemXml, "link", "href"),
      description: extractTag(itemXml, "description"),
      pubDate: extractTag(itemXml, "pubDate") || extractTag(itemXml, "dc:date"),
      guid: extractTag(itemXml, "guid") || extractTag(itemXml, "link"),
      imageUrl: extractEnclosureUrl(itemXml) || extractTag(itemXml, "media:content", "url"),
    });
  }

  // Try Atom format if no RSS items found
  if (items.length === 0) {
    const atomEntries = xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
    for (const entryXml of atomEntries) {
      items.push({
        title: extractTag(entryXml, "title"),
        link: extractAttr(entryXml, "link", "href"),
        description: extractTag(entryXml, "summary") || extractTag(entryXml, "content"),
        pubDate: extractTag(entryXml, "published") || extractTag(entryXml, "updated"),
        guid: extractTag(entryXml, "id") || extractAttr(entryXml, "link", "href"),
      });
    }
  }

  return items;
}

function extractTag(xml: string, tag: string, attr?: string): string {
  if (attr) {
    const re = new RegExp(`<${tag}[^>]*\\s${attr}="([^"]*)"`, "i");
    const m = xml.match(re);
    return m ? m[1] : "";
  }
  // Handle CDATA
  const cdataRe = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, "i");
  const cdataMatch = xml.match(cdataRe);
  if (cdataMatch) return cdataMatch[1].trim();

  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : "";
}

function extractAttr(xml: string, tag: string, attr: string): string {
  const re = new RegExp(`<${tag}[^>]*\\s${attr}="([^"]*)"`, "i");
  const m = xml.match(re);
  return m ? m[1] : "";
}

function extractEnclosureUrl(xml: string): string {
  const m = xml.match(/<enclosure[^>]*\surl="([^"]*)"[^>]*type="image/i);
  return m ? m[1] : "";
}
