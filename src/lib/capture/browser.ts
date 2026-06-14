/**
 * Lazy browser launcher.
 *
 * On Vercel serverless: uses @sparticuz/chromium for the binary +
 * puppeteer-core for the API. The browser is launched once per invocation
 * and reused for the lifetime of that invocation — batch callers (multiple
 * captures in one operator action) amortize the ~1-2s cold-start cost.
 *
 * On local/dev: also uses @sparticuz/chromium if available, falling back
 * to system Chrome via PUPPETEER_EXECUTABLE_PATH if set.
 */
import type { Browser, LaunchOptions } from "puppeteer-core";

let browserPromise: Promise<Browser> | null = null;

async function launch(): Promise<Browser> {
  const puppeteer = await import("puppeteer-core");
  const chromium = (await import("@sparticuz/chromium")).default;

  const opts: LaunchOptions = {
    args: chromium.args,
    defaultViewport: { width: 1440, height: 900 },
    executablePath:
      process.env.PUPPETEER_EXECUTABLE_PATH ||
      (await chromium.executablePath()),
    headless: true,
  };

  return puppeteer.launch(opts);
}

/**
 * Return the shared browser instance for this invocation, launching on
 * first call. Callers should NOT close the browser — the process exit /
 * invocation teardown handles it.
 */
export async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = launch().catch((e) => {
      // Allow retry on next call after a failed launch.
      browserPromise = null;
      throw e;
    });
  }
  return browserPromise;
}

/**
 * Force-close the browser. Useful for tests or explicit cleanup; not
 * called in normal serverless flow.
 */
export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    browserPromise = null;
    if (b) await b.close();
  }
}
