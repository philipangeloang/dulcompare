import { chromium, type Browser } from 'playwright';

export async function withBrowser<T>(fn: (b: Browser) => Promise<T>): Promise<T> {
  const browser = await chromium.launch();
  try { return await fn(browser); }
  finally { await browser.close(); }
}
