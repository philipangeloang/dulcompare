import type { Preset } from '@/lib/types';

// Page lists copied verbatim from the existing dulcolax Playwright configs:
// - SEO: opl-frontend/tests/seo/urls/dulcolax.react.ts
// - dataLayer: opl-frontend/tests/datalayer/urls.dulcolax.react.ts
export const SEED_PRESETS: Preset[] = [
  {
    id: 'dulcolax-seo',
    name: 'Dulcolax SEO',
    suite: 'seo',
    pages: [
      { label: 'Home', path: '' },
      { label: 'Product List', path: 'products' },
      { label: 'Product Finder', path: 'products/product-finder' },
      { label: 'Product Detail', path: 'products/gummies' },
      { label: 'Product Detail', path: 'products/powder-laxative' },
      { label: 'Product Detail', path: 'products/liquid-gel' },
      { label: 'Product Detail', path: 'products/laxative-tablets' },
      { label: 'Product Detail', path: 'products/soft-chews' },
      { label: 'Product Detail', path: 'products/chewy-fruit-bites' },
      { label: 'Product Detail', path: 'products/liquid-laxative' },
      { label: 'Product Detail', path: 'products/stool-softener' },
      { label: 'Product Detail', path: 'products/laxative-suppositories' },
      { label: 'Product Detail', path: 'products/pink-laxative-tablets' },
      { label: 'Product Detail', path: 'products/kids-soft-chews' },
      { label: 'Article List', path: 'about-constipation' },
      { label: 'Article Detail', path: 'about-constipation/what-is-constipation' },
      { label: 'Article Detail', path: 'about-constipation/digestive-system' },
      { label: 'Article Detail', path: 'about-constipation/bowel-movement' },
      { label: 'Article Detail', path: 'about-constipation/constipation-and-diarrhea' },
      { label: 'Article Detail', path: 'about-constipation/constipation-and-bloating' },
      { label: 'Article Detail', path: 'about-constipation/laxative-types' },
      { label: 'Article Detail', path: 'about-constipation/home-remedies-for-constipation' },
      { label: 'Article Detail', path: 'about-constipation/constipation-in-old-age' },
      { label: 'Article Detail', path: 'about-constipation/pregnancy-constipation' },
      {
        label: 'Article Detail',
        path: 'about-constipation/travel-constipation-relief-your-guide-to-digestive-health-on-the-go',
      },
      { label: 'Article Detail', path: 'about-constipation/constipation-in-children' },
      { label: 'Article Detail', path: 'about-constipation/constipation-signs-symptoms' },
      { label: 'Article Detail', path: 'about-constipation/stress-and-constipation' },
      { label: 'Article Detail', path: 'about-constipation/constipation-before-period' },
      { label: 'Article Detail', path: 'about-constipation/a-guide-to-use-fibers' },
      { label: 'Article Detail', path: 'about-constipation/foods-to-avoid-when-constipated' },
      {
        label: 'Article Detail',
        path: 'about-constipation/how-your-mental-health-might-affect-constipation',
      },
      {
        label: 'Article Detail',
        path: 'about-constipation/how-physical-health-influences-occasional-constipation-and-digestive-wellness',
      },
      { label: 'Article Detail', path: 'about-constipation/pregnancy-during-constipation' },
      { label: 'Article Detail', path: 'about-constipation/fiber-and-menopause' },
      { label: 'Article Detail', path: 'about-constipation/pms-and-digestive-issues' },
      { label: 'Article Detail', path: 'about-constipation/digestive-system-process' },
      { label: 'Article Detail', path: 'about-constipation/suppository-and-constipation' },
      { label: 'Article Detail', path: 'about-constipation/can-stress-cause-constipation' },
      { label: 'Article Detail', path: 'about-constipation/breaking-the-taboo' },
      { label: 'Values', path: 'values/our-mission' },
      { label: 'Values', path: 'values/sustainability' },
      { label: 'Buy', path: 'where-to-buy' },
      { label: 'Coupons', path: 'coupons' },
      { label: 'Coupons', path: 'coupons/printable-coupons' },
      { label: 'Coupons', path: 'coupons/mobile-coupons' },
      { label: 'Community Guidelines', path: 'community-guidelines' },
      { label: 'Contact', path: 'sign-up-and-save' },
      { label: 'Recycling', path: 'recycling' },
    ],
  },
  {
    id: 'dulcolax-datalayer',
    name: 'Dulcolax dataLayer',
    suite: 'datalayer',
    pages: [
      {
        label: 'Home',
        path: '',
        interactions: [
          { type: 'click', selector: '.hero--content--wrapper a[data-gtm-click="true"]' }, // click_banner (before nav opens)
          { type: 'click', selector: 'nav a.mega-nav__itemLink' }, // click_menu
          { type: 'click', selector: 'footer .footer__quickLink' }, // click_footer
          { type: 'click', selector: 'footer a[target="_blank"]' }, // click_outbound_link (social links)
        ],
      },
      {
        label: 'Error Page',
        path: 'this-page-does-not-exist',
        skipEvents: ['generic'],
      },
      {
        label: 'Product List',
        path: 'products',
        skipEvents: ['generic'],
        interactions: [
          { type: 'click', selector: '[data-gtm-type="product_card"]' }, // select_item
          { type: 'select', selector: 'select' }, // filter_item
          { type: 'click', selector: '.breadcrumbs--link' }, // click_cta
        ],
      },
      {
        label: 'Product Detail',
        path: 'products/chewy-fruit-bites',
        skipEvents: ['generic'],
        interactions: [
          { type: 'click', selector: '.productDetailSlider__navButton.right.carousel__navButton' }, // click_item_carousel
          { type: 'click', selector: '.bv_main_rating_button' }, // click_read_review
          { type: 'click', selector: '.bv_button_component_container button' }, // click_add_review
          { type: 'click', selector: '.accordion__trigger[data-faq="true"]' }, // click_faq

          { type: 'click', selector: '.product-info-gtm' }, // click_item_info
          { type: 'click', selector: '.ps-online-buy-button' }, // click_retailer
          { type: 'click', selector: '.link.product-info-gtm' }, // opens modal → click_item_info
          { type: 'wait', ms: 600 },
          { type: 'click', selector: 'button[title="close modal"]' }, // closes modal → click_popup
        ],
      },
      {
        label: 'Article List',
        path: 'about-constipation',
        skipEvents: ['generic'],
        interactions: [
          { type: 'click', selector: '[data-gtm-type="article_card_item"]' }, // click_article
        ],
      },
      {
        label: 'Article Detail',
        path: 'about-constipation/what-is-constipation',
        skipEvents: ['generic'],
      },
      {
        label: 'Page with Video',
        path: '', // Homepage
        skipEvents: ['generic'],
        interactions: [{ type: 'video' }],
      },
      {
        label: 'Contact / Lead Form',
        path: 'sign-up-and-save',
        skipEvents: ['generic'],
        interactions: [
          { type: 'fill', selector: 'input[type="text"]', value: 'test' },
          { type: 'fill', selector: 'input[type="email"]', value: 'notAEmail' },
          { type: 'click', selector: 'button[type="submit"]' },
          { type: 'fill', selector: 'input[type="email"]', value: 'test@test.com' },
          { type: 'click', selector: 'button[type="submit"]' },
        ],
      },
      {
        label: 'Buy',
        path: 'where-to-buy',
        skipEvents: ['generic'],
        interactions: [
          { type: 'click', selector: '.ps-map-location-button' }, // search_store
          { type: 'click', selector: '.ps-online-buy-button' }, // click_retailer
          { type: 'click', selector: '.ps-local-seller-select' }, // click_store
        ],
      },
    ],
  },
];
