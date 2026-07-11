import type { Page } from 'playwright';
import type { Interaction } from '@/lib/types';

export async function runInteractions(page: Page, interactions: Interaction[], label = ''): Promise<string[]> {
  const tag = label ? `[${label}]` : '';
  const failures: string[] = [];

  for (const step of interactions) {
    switch (step.type) {
      case 'click': {
        const el = page.locator(step.selector).first();
        const found = await el.isVisible({ timeout: 5000 }).catch(() => false);
        if (!found) {
          const msg = `skip click — selector not found: ${step.selector}`;
          console.warn(`  ${tag} ⚠ ${msg}`);
          failures.push(`click: ${step.selector}`);
          break;
        }
        await el.scrollIntoViewIfNeeded();
        // Only block navigation for anchor tags — buttons and other elements need
        // their default behaviour (e.g. accordion open) to trigger tracking.
        const isLink = await page.evaluate(sel => {
          const node = document.querySelector(sel);
          return node?.tagName === 'A' && (node as HTMLAnchorElement).href !== '';
        }, step.selector);
        if (isLink) {
          // Block navigation at the document level — per-element listeners can miss
          // when Playwright's coordinate-based click lands on a descendant node.
          await page.evaluate(() => {
            document.addEventListener(
              'click',
              e => {
                const anchor = (e.target as HTMLElement).closest('a[href]');
                if (anchor) e.preventDefault();
              },
              { once: true, capture: true }
            );
          });
          await el.click({ force: true });
        } else {
          // For buttons/divs (accordions, tabs, etc.) use JS dispatch so UIKit
          // pointer-event listeners fire correctly and custom events propagate.
          await page.evaluate(sel => {
            const node = document.querySelector(sel);
            node?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
            node?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          }, step.selector);
        }
        await page.waitForTimeout(1200);
        break;
      }

      case 'select': {
        const sel = page.locator(step.selector).first();
        const found = await sel.isVisible({ timeout: 5000 }).catch(() => false);
        if (!found) {
          console.warn(`  ${tag} ⚠ skip select — selector not found: ${step.selector}`);
          failures.push(`select: ${step.selector}`);
          break;
        }
        await sel.scrollIntoViewIfNeeded();
        await sel.selectOption(step.value ? { value: step.value } : { index: 1 });
        await page.waitForTimeout(1000);
        break;
      }

      case 'fill': {
        const el = page.locator(step.selector).first();
        const found = await el.isVisible({ timeout: 5000 }).catch(() => false);
        if (!found) {
          console.warn(`  ${tag} ⚠ skip fill — selector not found: ${step.selector}`);
          failures.push(`fill: ${step.selector}`);
          break;
        }
        await el.scrollIntoViewIfNeeded();
        await el.fill(step.value);
        await page.waitForTimeout(800);
        break;
      }

      case 'focus': {
        await page.locator(step.selector).first().focus();
        await page.waitForTimeout(500);
        break;
      }

      case 'video': {
        // Try native <video> element first, then fall back to YouTube iframe / overlay play buttons.
        const nativeVideo = page.locator('video').first();
        const hasNativeVideo = await nativeVideo.isVisible({ timeout: 3000 }).catch(() => false);

        if (hasNativeVideo) {
          await nativeVideo.scrollIntoViewIfNeeded();
          await nativeVideo.click();
          await page.waitForTimeout(1500);

          const MILESTONES = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
          await page.evaluate(
            ({ milestones }) => {
              const v = document.querySelector('video') as HTMLVideoElement;
              if (!v || !v.duration) return;
              let i = 0;
              const seek = () => {
                if (i >= milestones.length) return;
                v.currentTime = v.duration * milestones[i++];
                setTimeout(seek, 400);
              };
              seek();
            },
            { milestones: MILESTONES }
          );
          await page.waitForTimeout(MILESTONES.length * 400 + 1000);
        } else {
          // YouTube / custom embed — click the play button overlay or the iframe itself.
          const playSelectors = [
            step.selector,
            '[class*="play"]',
            '[aria-label*="Play" i]',
            'button[class*="video"]',
            '.video-wrapper',
            'iframe[src*="youtube"]',
          ].filter(Boolean) as string[];

          for (const s of playSelectors) {
            const el = page.locator(s).first();
            if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
              await el.scrollIntoViewIfNeeded();
              await el.click({ force: true });
              await page.waitForTimeout(3000); // YouTube autoplay needs time to register events
              break;
            }
          }
        }
        break;
      }

      case 'seek': {
        const sel = step.selector ?? 'video';
        await page.evaluate(
          ({ s, p }) => {
            const v = document.querySelector(s) as HTMLVideoElement;
            if (v) v.currentTime = v.duration * p;
          },
          { s: sel, p: step.percent }
        );
        await page.waitForTimeout(800);
        break;
      }

      case 'scroll-to-top': {
        await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight }));
        await page.waitForTimeout(600);
        const candidates = [
          '[data-scroll-to-top]',
          '.scroll-to-top',
          '#scrollToTop',
          '[aria-label*="top" i]',
          'button[class*="scroll"]',
        ];
        for (const sel of candidates) {
          const btn = page.locator(sel).first();
          if (await btn.isVisible().catch(() => false)) {
            await btn.click();
            break;
          }
        }
        await page.waitForTimeout(800);
        break;
      }

      case 'wait':
        await page.waitForTimeout(step.ms);
        break;
    }
  }

  return failures;
}
