import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const src = (p) => path.resolve(__dirname, "src", p);

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: [
      // Components link and navigate through @/lib/router (Next's router in
      // the app); tests run the same API on react-router's MemoryRouter.
      // The real module's own tests import it as ./router.jsx.
      { find: /^@\/lib\/router$/, replacement: src("test/router.jsx") },
      // Components that use Next's router directly (the signed-in flows) get
      // the same thing: its hooks and <Link> on the MemoryRouter. Next's
      // server helpers (notFound, redirect) are the real ones.
      { find: /^next\/navigation$/, replacement: src("test/next-navigation.jsx") },
      { find: /^next\/link$/, replacement: src("test/next-link.jsx") },
      // Server-only modules import this marker; in tests it is nothing.
      { find: /^server-only$/, replacement: src("test/empty.js") },
      { find: /^@\//, replacement: `${src("")}/` },
    ],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.js"],
    exclude: ["**/node_modules/**", "**/.next/**"],
  },
});
