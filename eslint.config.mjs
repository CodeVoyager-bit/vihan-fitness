import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Every database call is async: a forgotten `await` would drop a write or skip its error.
  {
    files: ["src/**/*.{ts,tsx}", "scripts/**/*.mts", "tests/**/*.mts"],
    ignores: ["src/components/bits/**"],
    languageOptions: { parserOptions: { projectService: true } },
    rules: {
      "@typescript-eslint/no-floating-promises": ["error", { allowForKnownSafeCalls: [{ from: "package", package: "node:test", name: ["describe", "test"] }] }],
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: false }],
      "@typescript-eslint/await-thenable": "error",
      // A Promise in a template string would print "[object Promise]" (e.g. into a QR link).
      "@typescript-eslint/restrict-template-expressions": "error",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored third-party animation components from reactbits.dev, kept as published.
    "src/components/bits/**",
  ]),
]);

export default eslintConfig;
