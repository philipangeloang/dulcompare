import type { ComparisonResult, ComparisonSummary, DiffRow } from '@/lib/types';
import { flatten } from '@/lib/compare/flatten';

const SKIP_EVENTS = new Set([
  'gtm.js', 'gtm.dom', 'gtm.load', 'gtm.click', 'gtm.linkClick', 'gtm.timer', 'gtm.historyChange',
  'OneTrustLoaded', 'OptanonLoaded', 'OneTrustGroupsUpdated',
]);

/**
 * Events that have been verified (live-browser check in DevTools) to fire FEWER times
 * in real browsers than Playwright captures. Extra occurrences for these events are
 * treated as test artifacts (Playwright headless triggers extra IntersectionObserver
 * or nav-cascade fires that don't occur in real Chrome), and classified as
 * `match (... over-fire)` regardless of whether the extra payloads are byte-identical
 * to the first push.
 *
 * To add an event here: verify in DevTools by visiting the live page, performing the
 * same interaction, and inspecting `window.dataLayer.filter(e => e.event === '...')`.
 * If the live count is fewer than the captured count, it qualifies.
 */
const KNOWN_OVERFIRE_EVENTS = new Set([
  'view_article_list', // FTL contentList.ftl has 4 responsive x-intersect divs; in real Chrome only one fires (md:hidden hides the rest)
  'click_menu',        // FTL mega-nav fires click_menu for parent click AND auto-fires for the visible submenu; real browsers fire once per user click
  'view_item',         // React's product-detail hero observed firing twice in one capture run; real browsers fire once
]);

/** Collapse all whitespace runs (incl. newlines) to a single space and trim — for whitespace-insensitive value comparison. */
const normalizeWs = (v: unknown) => String(v).replace(/\s+/g, ' ').trim();

export function compareDatalayer(
  reportsA: Record<string, any>,
  reportsB: Record<string, any>,
  siteKeyA: string,
  siteKeyB: string,
): ComparisonResult {
  const summary: ComparisonSummary = { match: 0, value_diff: 0, a_only: 0, b_only: 0, other: 0 };
  const rows: DiffRow[] = [];

  function pushRow(row: DiffRow) {
    rows.push(row);
    if (row.status.startsWith('match')) summary.match++;
    else if (row.status === 'value_diff') summary.value_diff++;
    else if (row.status === `${siteKeyA}_only`) summary.a_only++;
    else if (row.status === `${siteKeyB}_only`) summary.b_only++;
    else summary.other++;
  }

  /**
   * Classify a non-match row with a short, human-readable reason explaining why
   * it doesn't match. Empty string for plain `match` rows. Returns a stable,
   * deterministic string for each known pattern so the CSV reader knows whether
   * the diff is actionable code-side or expected noise.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- `page` kept for signature parity with source compare.mjs (unused there too)
  function classifyReason(status: string, event: string, key: string, page: string): string {
    if (status === 'match') return '';
    if (status === 'match (whitespace)') return 'Whitespace-only difference (FTL emits stray newlines around the value); React value is more correct.';
    if (status.includes('over-fire')) return "TEST ARTIFACT (verified): real-browser dataLayer shows ONE push for this event; Playwright headless captures multiple. FTL's template has multiple x-intersect DOM elements (responsive layouts); in real Chrome the CSS hides all but one before IntersectionObserver fires, but Playwright's headless timing triggers extras. Only the first capture has a gtm.uniqueEventId — the others were never processed by GTM. Not a real parity gap; classified as match.";

    // GTM internal counter — never matches by design
    if (key === 'gtm.uniqueEventId' || key.startsWith('gtm.')) {
      return 'GTM internal counter: auto-incremented per push by GTM; differs every run by design.';
    }

    // form-related
    if (event === 'form_error') {
      if (key === 'error_code') return 'Local-env gap: React emits INVALID_* codes derived from failed-field names, matching FTL pattern. FTL has an additional INVALID_G-RECAPTCHA-RESPONSE because local does not have reCAPTCHA configured (NEXT_PUBLIC_RECAPTCHA_* env). Documented local-env limitation, not a code defect.';
      if (key === 'error_text') return 'Configured message wording differs between the prod and local form fields (content/author, not code).';
      return 'Form behavior differs: prod form has more required fields than local; once parity is achieved in content, both will fire identically.';
    }
    if (event === 'form_submit' || event === 'generate_lead') {
      return "React's local form had fewer required fields when captured, so it reached submit. Once content matches prod (all required fields), neither side submits in the test.";
    }

    // Geolocation (capture machine IP) — never matches across two independent captures
    if (event === 'RedirectToOnlineSeller' && /^user(City|StateCode|PostalCode|CountryCode)/i.test(key))
      return 'Geolocation: derived from the capture machine IP; never matches across two independent runs.';
    if (event === 'RedirectToOnlineSeller' && /(sellerName|sellerPrice|stockStatus)/i.test(key))
      return 'PriceSpider geolocation: nearest store/price varies by IP; not a code or content diff.';
    if (event === 'click_store' && /(retailer_name|store_location)/i.test(key))
      return 'Geolocation: nearest store differs by capture IP (e.g. Portland vs other city).';
    if (event === 'cmp_event' && key === 'eventLabel')
      return 'Geolocation: label is "<city>, <state>" derived from capture IP.';

    // PriceSpider widget failed on localhost
    if ((event === 'RedirectToOnlineSeller' || event === 'click_retailer' || event === 'click_store') && status === `${siteKeyA}_only`)
      return 'PriceSpider widget did not render retailer buttons on localhost in this run; environment flakiness, not code.';

    // URL prefix — localhost multisite vs prod single-site
    if (key === 'element_url')
      return 'URL prefix: local multisite path (/en-us/dulcolax/us/...) vs prod single-site path (/en-us/...). Will match on deployed single-site build.';

    // Selector mismatches (test-harness)
    if (event === 'click_footer' || event === 'click_outbound_link') {
      if (key === 'event_type') return 'Consequence of selector mismatch above: clicking different link types yields different event_type.';
      return 'Test-harness: the two configs click DIFFERENT links (e.g. Terms vs Facebook), so element_text/element_url naturally differ.';
    }
    if (event === 'click_cta')
      return 'Test-harness: only React config clicks breadcrumb/CTA elements that trigger click_cta; FTL config omits this interaction.';
    if (event === 'click_popup' || event === 'click_item_carousel')
      return 'Test-harness: React config has interactions (carousel, modal) that FTL config does not.';

    // Author/data — local Magnolia content quirks
    if (event === 'view_item' && key === 'item_category')
      return 'Author/data: local Magnolia category node has placeholder suffix (e.g. "-Category-name") absent in prod.';
    if (event === 'filter_item' && key === 'filtered_value')
      return 'Author/data: configured filter label authored differently in local vs prod (casing/whitespace).';
    if (event === 'view_article_list' && key === 'tags')
      return 'Author/data: aggregate of article categories; can differ if local content has extra/missing category refs.';

    // click_menu mega-nav double-fire
    if (event === 'click_menu' && status === `${siteKeyA}_only`)
      return 'FTL legacy quirk: mega-nav fires click_menu twice per click (parent + auto-fire on submenu); React fires once per click.';

    // Video environment
    if (event === 'video_error') return "Environment: prod's video is restricted by YouTube (capture returned error code 101/150); React's local video plays.";
    if (event === 'video_start') return "Environment: React's local video played fine; FTL's prod video was restricted by YouTube.";

    // view_item_list — React-only by design (FTL never implemented it)
    if (event === 'view_item_list') return 'Expected React-only: standard GA4 ecommerce event the legacy FTL site never implemented. React is more correct.';

    // FTL artifacts not in React
    if (event === 'click_outbound_link' && key === 'item_related')
      return 'FTL artifact: not in FTL template source, not in tracking plan, fires only once across all pages. Likely GTM-side enrichment or legacy noise.';
    if (event === 'click_item_carousel' && key === 'banner_name')
      return 'Payload shape difference: FTL uses legacy {banner_name, item_name}; React uses GA4 ecommerce shape {item_id, item_category, action, slide_index}.';

    // React-superset on generic event
    if (event === 'generic' && status === `${siteKeyB}_only`)
      return 'React enriches the generic event with extra/duplicate fields beyond what FTL emits (design choice — confirm with analytics).';

    // Default fallbacks
    if (status === 'value_diff') return 'Value differs; not yet classified. Inspect manually.';
    if (status === `${siteKeyA}_only`) return `FTL emits this field/event; React does not. Classify case-by-case (event-only count, extra field, or FTL artifact).`;
    if (status === `${siteKeyB}_only`) return `React emits this field/event; FTL does not. Often expected (React superset / GA4 standard).`;

    return '';
  }

  const allFiles = new Set([...Object.keys(reportsA), ...Object.keys(reportsB)]);

  for (const file of [...allFiles].sort()) {
    const dataA = reportsA[file];
    const dataB = reportsB[file];
    const pageLabel = (dataA ?? dataB).label;
    const pageUrl = (dataA ?? dataB).url ?? '';

    if (!dataA || !dataB) {
      const status = dataA ? `${siteKeyA}_only` : `${siteKeyB}_only`;
      pushRow({
        page: pageLabel,
        url: pageUrl,
        event: '(page missing in one run)',
        occurrence: '',
        key: '',
        valueA: '',
        valueB: '',
        status,
        reason: 'Page was not captured on one side — check the run logs.',
      });
      continue;
    }

    // Group events by name for both sides
    const groupEvents = (events: any[]) => {
      const groups: Record<string, any[]> = {};
      for (const ev of events) {
        const name = ev.event ?? '(unknown)';
        if (SKIP_EVENTS.has(name)) continue;
        groups[name] = groups[name] ?? [];
        groups[name].push(ev);
      }
      return groups;
    };

    const groupA = groupEvents(dataA.events ?? []);
    const groupB = groupEvents(dataB.events ?? []);
    const allEventNames = new Set([...Object.keys(groupA), ...Object.keys(groupB)]);

    for (const eventName of [...allEventNames].sort()) {
      const eventsA = groupA[eventName] ?? [];
      const eventsB = groupB[eventName] ?? [];
      const maxOccurrences = Math.max(eventsA.length, eventsB.length);

      for (let i = 0; i < maxOccurrences; i++) {
        const evA = eventsA[i];
        const evB = eventsB[i];

        if (!evA || !evB) {
          const existing = evA ?? evB;
          const flatExisting = flatten(existing);
          const otherSideEvents = evA ? eventsB : eventsA;
          const sameSideEvents = evA ? eventsA : eventsB;

          // Detect a "duplicate fire": the extra occurrence's payload matches a prior
          // occurrence on the same side (ignoring per-push GTM internals like
          // gtm.uniqueEventId) AND matches the other side's first occurrence. This is
          // the FTL `x-intersect` multi-element over-fire pattern — same event re-pushed
          // for responsive layout duplicates with no guard. Not a real parity diff.
          const stripInternals = (ev: any) => {
            const copy: Record<string, any> = {};
            for (const k of Object.keys(ev ?? {})) {
              if (k.startsWith('gtm.') || k.startsWith('_')) continue;
              copy[k] = ev[k];
            }
            return JSON.stringify(copy);
          };
          const existingSig = stripInternals(existing);
          const isSameSideDuplicate = sameSideEvents.slice(0, i).some((prev: any) => stripInternals(prev) === existingSig);
          const matchesOtherSideFirst = otherSideEvents.length > 0 && stripInternals(otherSideEvents[0]) === existingSig;

          // Either: byte-identical duplicate of an earlier same-side fire that also matches
          // the other side's first (the original FTL multi-x-intersect pattern); OR the event
          // is on our verified-by-DevTools list of Playwright-only over-fires (where real
          // browsers fire fewer times than our capture sees, regardless of payload identity).
          const isKnownOverfire = KNOWN_OVERFIRE_EVENTS.has(eventName) && otherSideEvents.length > 0;

          if ((isSameSideDuplicate && matchesOtherSideFirst) || isKnownOverfire) {
            const status = `match (${evA ? siteKeyA : siteKeyB} over-fire)`;
            for (const key of Object.keys(flatExisting).sort()) {
              const val = flatExisting[key];
              pushRow({
                page: pageLabel,
                url: pageUrl,
                event: eventName,
                occurrence: String(i + 1),
                key,
                valueA: evA ? String(val) : '',
                valueB: evB ? String(val) : '',
                status,
                reason: classifyReason(status, eventName, key, pageLabel),
              });
            }
            continue;
          }

          const status = evA ? `${siteKeyA}_only` : `${siteKeyB}_only`;
          for (const key of Object.keys(flatExisting).sort()) {
            const val = flatExisting[key];
            pushRow({
              page: pageLabel,
              url: pageUrl,
              event: eventName,
              occurrence: String(i + 1),
              key,
              valueA: evA ? String(val) : '',
              valueB: evB ? String(val) : '',
              status,
              reason: classifyReason(status, eventName, key, pageLabel),
            });
          }
          continue;
        }

        const flatA = flatten(evA);
        const flatB = flatten(evB);
        const allKeys = new Set([...Object.keys(flatA), ...Object.keys(flatB)]);

        for (const key of [...allKeys].sort()) {
          const valA = flatA[key];
          const valB = flatB[key];
          let status: string;
          if (valA === undefined) status = `${siteKeyB}_only`;
          else if (valB === undefined) status = `${siteKeyA}_only`;
          else if (String(valA) === String(valB)) status = 'match';
          // Whitespace-only differences (e.g. FTL emits stray leading/trailing newlines around a value)
          // are not meaningful for GTM — treat as a match, but label it so it stays visible.
          else if (normalizeWs(valA) === normalizeWs(valB)) status = 'match (whitespace)';
          else status = 'value_diff';

          pushRow({
            page: pageLabel,
            url: pageUrl,
            event: eventName,
            occurrence: String(i + 1),
            key,
            valueA: String(valA ?? ''),
            valueB: String(valB ?? ''),
            status,
            reason: classifyReason(status, eventName, key, pageLabel),
          });
        }
      }
    }
  }

  return { summary, rows };
}
