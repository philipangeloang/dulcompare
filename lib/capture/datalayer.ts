import type { Page } from 'playwright';

export async function acceptCookies(page: Page) {
  const selectors = [
    '#onetrust-accept-btn-handler',
    '[id*="accept-recommended"]',
    'button[class*="accept-all"]',
    'button:has-text("Accept All")',
    'button:has-text("Accept Cookies")',
    'button:has-text("Allow All")',
  ];
  for (const sel of selectors) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(1000);
      return;
    }
  }
}

export async function installDatalayerCapture(page: Page) {
  await page.addInitScript(() => {
    if ((window as any).__dlCapture) return; // already installed on this page session
    (window as any).__dlCapture = [];
    const orig: any[] = (window as any).dataLayer ?? [];
    (window as any).dataLayer = new Proxy(orig, {
      get(target, prop) {
        if (prop === 'push') {
          return (...args: any[]) => {
            (window as any).__dlCapture.push(...args);
            return Array.prototype.push.apply(target, args);
          };
        }
        return (target as any)[prop];
      },
    });
  });
}

export async function collectEvents(page: Page): Promise<any[]> {
  const raw: any[] = await page.evaluate(() => (window as any).__dlCapture ?? []);
  return raw.filter(e => e.event && e.event !== 'gtm.js');
}
