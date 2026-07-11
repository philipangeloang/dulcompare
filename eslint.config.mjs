import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // seo.ts is a verbatim port of the source SEO capture helpers; its
    // page.evaluate bodies must stay byte-identical, so allow the `any[]`
    // return/collection types the source uses.
    files: ["lib/capture/seo.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    // seo-compare.ts is a verbatim port of the source compare.mjs diff
    // logic, which operates on untyped raw Magnolia/JSON report data
    // (hreflang entries, JSON-LD schema blocks). Allow `any` for those.
    files: ["lib/compare/seo-compare.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    // store.ts persists on-disk JSON site reports whose shape varies by
    // suite (seo vs datalayer); readSiteReport returns raw untyped JSON.
    files: ["lib/store.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    // datalayer.ts is a verbatim port of the source dataLayer capture
    // helpers; the addInitScript proxy body must stay byte-identical, so
    // allow the `any` types the source uses for window.dataLayer/__dlCapture.
    files: ["lib/capture/datalayer.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    // datalayer-compare.ts is a verbatim port of the source compare.mjs
    // dataLayer diff logic, which operates on untyped raw GTM event JSON.
    // Allow `any` for those.
    files: ["lib/compare/datalayer-compare.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]);

export default eslintConfig;
