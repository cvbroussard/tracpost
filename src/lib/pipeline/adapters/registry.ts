import type { PlatformAdapter } from "./types";
import { instagramAdapter } from "./instagram";
import { facebookAdapter } from "./facebook";
import { gbpAdapter } from "./gbp";
import { tiktokAdapter } from "./tiktok";
import { twitterAdapter } from "./twitter";
import { linkedinAdapter } from "./linkedin";
import { youtubeAdapter } from "./youtube";
import { pinterestAdapter } from "./pinterest";

/**
 * Adapter registry — maps platform name to adapter instance.
 *
 * To add a new platform:
 * 1. Create src/lib/pipeline/adapters/{platform}.ts implementing PlatformAdapter
 * 2. Register it here
 * 3. Add platform-specific caption rules in caption-generator.ts
 */
const adapters = new Map<string, PlatformAdapter>();

adapters.set(instagramAdapter.platform, instagramAdapter);
adapters.set(facebookAdapter.platform, facebookAdapter);
adapters.set(gbpAdapter.platform, gbpAdapter);
adapters.set(tiktokAdapter.platform, tiktokAdapter);
adapters.set(twitterAdapter.platform, twitterAdapter);
adapters.set(linkedinAdapter.platform, linkedinAdapter);
adapters.set(youtubeAdapter.platform, youtubeAdapter);
adapters.set(pinterestAdapter.platform, pinterestAdapter);

export function getAdapter(platform: string): PlatformAdapter | undefined {
  return adapters.get(platform);
}

export function hasAdapter(platform: string): boolean {
  return adapters.has(platform);
}

export function listPlatforms(): string[] {
  return Array.from(adapters.keys());
}
