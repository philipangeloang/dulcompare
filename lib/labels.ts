import type { Suite } from '@/lib/types';

/** Single source of truth for the user-facing suite name ("SEO" / "dataLayer"). */
export function suiteLabel(s: Suite): string {
  return s === 'seo' ? 'SEO' : 'dataLayer';
}
