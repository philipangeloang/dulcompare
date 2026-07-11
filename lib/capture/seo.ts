import type { Page } from 'playwright';

export async function extractHreflang(page: Page): Promise<{ hreflang: string; href: string }[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="alternate"][hreflang]')).map(el => ({
      hreflang: el.getAttribute('hreflang') ?? '',
      href: el.getAttribute('href') ?? '',
    }))
  );
}

export async function extractSchema(page: Page): Promise<any[]> {
  return page.evaluate(() => {
    const results: any[] = [];
    document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]').forEach(el => {
      const raw = el.textContent ?? '';
      try {
        const parsed = JSON.parse(raw);
        if (parsed['@graph'] && Array.isArray(parsed['@graph'])) {
          for (const item of parsed['@graph']) {
            results.push(item);
          }
        } else {
          results.push(parsed);
        }
      } catch {
        results.push({ _parseError: true, _raw: raw.slice(0, 500) });
      }
    });
    return results;
  });
}

export async function extractMetadata(page: Page): Promise<{
  pageTitle: string;
  canonicalURL: string;
  robots: string;
  metaTitle: string;
  metaDescription: string;
  metaKeywords: string;
  ogType: string;
  ogTitle: string;
  ogDescription: string;
  ogURL: string;
  ogImageSecureURL: string;
  ogImage: string;
  ogImageAlt: string;
  ogSiteName: string;
  ogLocale: string;
  ogLocaleAlternate: string[];
  twitterCard: string;
  twitterTitle: string;
  twitterDescription: string;
  twitterImage: string;
  twitterImageAlt: string;
  twitterURL: string;
}> {
  return page.evaluate(() => {
    const metaName = (name: string) =>
      (document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ?? '').trim();
    const metaProp = (property: string) =>
      (document.querySelector(`meta[property="${property}"]`)?.getAttribute('content') ?? '').trim();

    return {
      pageTitle: (document.querySelector('head > title')?.textContent ?? '').trim(),
      canonicalURL: (document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '').trim(),
      robots: metaName('robots'),
      metaTitle: metaName('title'),
      metaDescription: metaName('description'),
      metaKeywords: metaName('keywords'),
      ogType: metaProp('og:type'),
      ogTitle: metaProp('og:title'),
      ogDescription: metaProp('og:description'),
      ogURL: metaProp('og:url'),
      ogImageSecureURL: metaProp('og:image:secure_url'),
      ogImage: metaProp('og:image'),
      ogImageAlt: metaProp('og:image:alt'),
      ogSiteName: metaProp('og:site_name'),
      ogLocale: metaProp('og:locale'),
      ogLocaleAlternate: Array.from(
        document.querySelectorAll('meta[property="og:locale:alternate"]')
      )
        .map(el => (el.getAttribute('content') ?? '').trim())
        .filter(Boolean),
      twitterCard: metaName('twitter:card'),
      twitterTitle: metaName('twitter:title'),
      twitterDescription: metaName('twitter:description'),
      twitterImage: metaName('twitter:image'),
      twitterImageAlt: metaName('twitter:image:alt'),
      twitterURL: metaName('twitter:url'),
    };
  });
}
