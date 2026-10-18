import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import globals from "globals";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "coverage/**"]),
  {
    files: ["**/*.{js,jsx,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": ["error", { varsIgnorePattern: "^[A-Z_]" }],
      // The site's images are plain <img>: posters and logos come through
      // /media redirects to S3, which next/image's optimizer would fetch and
      // bill for every size of every poster. Sizes are set by CSS boxes
      // (aspect-ratio), so nothing shifts.
      "@next/next/no-img-element": "off",
      // The React Compiler's stricter rules (react-hooks 7) flag patterns the
      // existing components use on purpose (state set from effects, refs
      // read while rendering). Off until those components are revisited.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/purity": "off",
      "react-hooks/immutability": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/static-components": "off",
      "react-hooks/use-memo": "off",
      "react-hooks/incompatible-library": "off",
      "react/display-name": "off",
      "react/no-unescaped-entities": "off",
    },
  },
  {
    files: ["**/*.test.{js,jsx}", "src/test/**"],
    languageOptions: { globals: { ...globals.node, ...globals.vitest } },
  },
]);
