# Pre-Release Cycle

This guide explains how to start and end a pre-release (beta) cycle for a new major version of the AI SDK.

## Overview

Every major release of the AI SDK introduces a new provider specification version (e.g. V3 to V4). Evolving the spec is the reason we do major releases — it lets us make breaking changes to the provider interface while giving provider authors a clear migration target.

A pre-release cycle lets us develop the next major version on `main` while keeping the current stable version available for patches. During the cycle:

- `main` publishes beta releases (e.g. `ai@7.0.0-beta.1`)
- A maintenance branch (e.g. `release-v6.0`) receives backported patches and publishes stable releases

## Starting a Pre-Release Cycle

### 1. Create a maintenance branch

Create a branch from the current `main` HEAD so the current stable version can continue receiving patches:

```bash
git checkout main
git pull origin main
git checkout -b release-v<current-major>.0   # e.g. release-v6.0
git push origin release-v<current-major>.0
```

The [release workflow](../.github/workflows/release.yml) already runs on `release-v*` branches, so no workflow changes are needed.

### 2. Enter pre-release mode on `main`

Switch back to `main` and enter changeset pre-release mode:

```bash
git checkout main
pnpm changeset pre enter beta
```

This modifies `.changeset/pre.json`. The `initialVersions` field should only contain packages from `packages/*/package.json` files — remove any other entries (e.g. `@example/*`, `tools/*`, or nested test packages). Commit and push the change (or open a PR).

### 3. Create a major changeset

Create a changeset that bumps every published package to the next major version:

```bash
pnpm changeset
```

Select all packages from `packages/*/package.json` (skip `@example/*`, `tools/*`, and any other non-`packages/` entries — they are private and not published) and choose `major` for each. Write a summary like:

> Start v7 pre-release

Commit the generated `.changeset/*.md` file.

### 4. Seed the new spec version

Every major release introduces a new provider specification version (e.g. V3 to V4). You must create a new version directory for **every** spec directory under `packages/provider/src/` that contains a versioned subdirectory. To find them, run:

```bash
ls -d packages/provider/src/*/v3
```

As of writing, the directories are: `embedding-model`, `embedding-model-middleware`, `image-model`, `image-model-middleware`, `language-model`, `language-model-middleware`, `provider`, `reranking-model`, `shared`, `speech-model`, `transcription-model`, `video-model`.

For **each** directory:

1. Copy the current spec directory (e.g. `v3/`) to a new version directory (e.g. `v4/`).
2. Rename all files from the old version to the new (e.g. `language-model-v3.ts` → `language-model-v4.ts`).
3. Inside each file, replace all occurrences of the old version with the new (e.g. `V3` → `V4`, `v3` → `v4` in type names, imports, and the `specificationVersion` literal).
4. Add `export * from './v4/index';` to the parent `index.ts` (before the v3 export).
5. Update cross-references: if the `provider` v4 spec imports other model types, ensure it imports from the new v4 paths (not v3).

Verify by running `pnpm build` in `packages/provider` — all new types should appear in the built `.d.ts` output.

### 5. Create mock test utilities

Create V4 counterparts for every mock file in `packages/ai/src/test/` (e.g. `mock-language-model-v3.ts` → `mock-language-model-v4.ts`). Update `packages/ai/test/index.ts` to export the new V4 mocks.

### 6. Set up the documentation site (ai-sdk.dev)

The documentation site lives in the `ai-studio` repository and uses a Git submodule pointing at this repository. During the pre-release cycle the site needs versioned branches and Vercel deployments for both stable and beta docs.

In the `vercel/ai` repository:

1. Update `.github/workflows/update-sdk-submodule-v6.yml` to track the `release-v6.0` branch instead of `main`.
2. Create `.github/workflows/update-sdk-submodule-v7.yml` — this workflow fetches `main`, checks out the `sdk/v7` branch in `ai-studio`, and pushes to `origin sdk/v7`.

In the `ai-studio` repository:

3. Create a `sdk/v7` branch (the default branch stays `sdk/v6` for now so the production site continues serving stable docs).
4. In Vercel, create a v7 preview deployment connected to the `sdk/v7` branch (e.g. `v7.ai-sdk.dev`).

### 7. Merge to `main`

Open a PR with all the changes from steps 2-5. Once merged, the first beta release (e.g. `ai@7.0.0-beta.1`) will be published automatically.

## During the Pre-Release Cycle

### Day-to-day development

- All feature PRs continue to target `main`.
- Every PR still needs a changeset (use `patch` by default).
- Beta versions are published automatically when the **Version Packages** PR is merged.

### Backporting fixes to stable

To backport a fix from `main` to the maintenance branch, add the `backport` label to the merged PR. This creates a new PR targeting the maintenance branch automatically.

### Publishing stable patches

Patches merged into the maintenance branch trigger the release workflow and publish stable patch releases.

## Ending the Pre-Release Cycle

When the new major version is ready for stable release:

### 1. Exit pre-release mode

```bash
git checkout main
pnpm changeset pre exit
```

This removes `.changeset/pre.json`. Commit and push (or open a PR).

### 2. Publish the stable release

Once the exit-PR is merged, the next **Version Packages** PR will produce stable versions (e.g. `ai@7.0.0`). Merge it to publish.

### 3. Switch the documentation site

In the `ai-studio` repository, change the default branch from `sdk/v6` to `sdk/v7` so the production site serves the new major version. Update the Vercel production deployment accordingly.

### 4. Archive the maintenance branch

The maintenance branch (e.g. `release-v6.0`) can remain for emergency patches but will no longer receive regular backports.
