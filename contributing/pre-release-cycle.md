# Pre-Release Cycle

This guide explains how to start and end a pre-release (beta) cycle for a new major version of the AI SDK.

## Overview

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

This modifies `.changeset/pre.json`. Commit and push the change (or open a PR).

### 3. Create a major changeset

Create a changeset that bumps every published package to the next major version:

```bash
pnpm changeset
```

Select **all** published packages and choose `major` for each. Write a summary like:

> Start v7 pre-release

Commit the generated `.changeset/*.md` file.

### 4. Seed the new spec version (if applicable)

If the major bump includes a new provider specification version (e.g. V3 to V4):

1. Copy the current spec directory (e.g. `packages/provider/src/language-model/v3/`) to a new version directory (e.g. `v4/`).
2. Rename all types from the old version to the new version (e.g. `LanguageModelV3` to `LanguageModelV4`).
3. Update the `specificationVersion` literal from `'v3'` to `'v4'`.
4. Add the new version directory to the parent `index.ts` exports.
5. Create corresponding mock test utilities in `packages/ai/src/test/` for the new spec version.

### 5. Merge to `main`

Open a PR with all the changes from steps 2-4. Once merged, the first beta release (e.g. `ai@7.0.0-beta.1`) will be published automatically.

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

### 3. Archive the maintenance branch

The maintenance branch (e.g. `release-v6.0`) can remain for emergency patches but will no longer receive regular backports.
