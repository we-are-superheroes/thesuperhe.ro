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
    // Local scratch areas (design bundles, editor backups) — never lint.
    ".tmp-designs/**",
    // Claude Code worktrees for spun-off background tasks — each has
    // its own checkout (and .next output) that must not be linted here.
    ".claude/worktrees/**",
    "design-extract/**",
    "nppBackup/**",
    "existing_prisma/**",
  ]),
]);

export default eslintConfig;
