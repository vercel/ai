---
fileMatcher:
  - 'packages/*/package.json'
  - 'packages/*/src/bridge/package.json'
  - 'packages/*/src/*/bridge/package.json'
  - 'packages/*/tests/e2e/*/package.json'
  - 'examples/*/package.json'
  - 'examples/*/src/lib/*-bridge/package.json'
  - 'examples/*/agent/harness/*/bridge/package.json'
  - 'tools/*/package.json'
  - 'apps/*/package.json'
---

# Zod Dependency Version Guidelines

Guidelines for the Zod version that first-party packages, harness bridges, examples, and tools install.

## ZOD-1: Install the repository's current Zod 4 version

- **Severity**: blocker
- **Applies to**: `zod` in `dependencies`, `devDependencies`, and `optionalDependencies`. `peerDependencies` are excluded.
- **Sources**: GHSA-mrhx-c7xc-m3w5, PR #24793, PR #25111

Declare `zod` at exactly the version in the `devDependencies` of `packages/ai/package.json` (currently `4.6.7`), optionally with a `^` prefix, and never at a Zod 3 version. Zod 3 has no patched release for GHSA-mrhx-c7xc-m3w5, security scanners open a ticket for every manifest that installs a vulnerable version, and mixing Zod 4 copies across workspace packages causes cross-package type errors.

When raising the version, update `packages/ai/package.json` and every other manifest in the same change.

Not affected by this rule:

- Published packages keep their Zod 3 and Zod 4 peer dependency range (for example `^3.25.76 || ^4.1.8`). This range defines consumer compatibility, not the installed version.
- The bundler tests in `tools/bundler-tests/run.mjs` install the minimum supported Zod versions on purpose.
- Implementation code still imports from `zod/v4` (or `zod/v3` for compatibility code), as described in `AGENTS.md`.
