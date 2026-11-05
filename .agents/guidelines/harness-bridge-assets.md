---
fileMatcher:
  - 'packages/harness-*/package.json'
  - 'packages/harness-*/src/**/*-bootstrap.ts'
  - 'packages/harness-*/**/bridge/*.json'
  - 'packages/harness-*/**/bridge/*.yaml'
  - 'packages/harness-*/**/bridge/*.ts'
---

# Harness Bridge Assets Guidelines

Guidelines for ensuring a functional bridge build for bridge-backed harness adapters.

## HBA-1: Ensure a `package.json` script correctly copies all bridge assets

- **Severity**: blocker
- **Applies to**: root `package.json` files for harness adapter packages that have a bridge (e.g. `src/bridge/` or `src/*/bridge/`)
- **Sources**: PR #24162, PR #24177

Include a `copy-bridge-assets` script in the harness package's `package.json`. It must copy all relevant bridge assets under `src/bridge/` into `dist/bridge/`.

**Critical:** `src/bridge/pnpm-lock.yaml` must be copied as `dist/bridge/pnpm-lockfile.yaml`! It's necessary because PNPM 12's `pnpm pack` unconditionally excludes files named `pnpm-lock.yaml`.

Example for bridge with `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`:

```json
"copy-bridge-assets": "node -e \"import('node:fs/promises').then(async fs => { await fs.copyFile('src/bridge/package.json', 'dist/bridge/package.json'); await fs.copyFile('src/bridge/pnpm-lock.yaml', 'dist/bridge/pnpm-lockfile.yaml'); await fs.copyFile('src/bridge/pnpm-workspace.yaml', 'dist/bridge/pnpm-workspace.yaml'); })\""
```

Example for bridge with `package.json`, `pnpm-lock.yaml`:

```json
"copy-bridge-assets": "node -e \"import('node:fs/promises').then(async fs => { await fs.copyFile('src/bridge/package.json', 'dist/bridge/package.json'); await fs.copyFile('src/bridge/pnpm-lock.yaml', 'dist/bridge/pnpm-lockfile.yaml'); })\""
```

## HBA-2: Ensure the harness adapter's bootstrap code correctly uses `createReadBridgeAsset()`

- **Severity**: blocker
- **Applies to**: `src/*-bootstrap.ts` for harness adapter packages that have a bridge (e.g. `src/bridge/` or `src/*/bridge/`)
- **Sources**: PR #24162, PR #24177

Ensure the harness's bootstrap code defines `const readBridgeAsset = createReadBridgeAsset();`, using the `createReadBridgeAsset` function from `@ai-sdk/harness/utils`. In that function call, provide the map of bridge file names and where to read them from. The special case for reading `pnpm-lock.yaml` from the dist folder's `pnpm-lockfile.yaml` must be considered here as well.

Example for `package.json`:

```ts
'package.json': new URL('./bridge/package.json', import.meta.url)
```

Example for `pnpm-lock.yaml`:

```ts
'pnpm-lock.yaml': new URL('./bridge/pnpm-lockfile.yaml', import.meta.url)
```
