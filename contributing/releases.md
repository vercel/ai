# Releases

We use [changesets](https://github.com/changesets/action) for automated releases.

## Changesets

- Every pull request that modifies production code (not `examples`/`docs`) must include a changeset.
- By default, use `patch` (non-breaking).
- To override, apply the `minor` or `major` label (CI enforces `patch` otherwise).

## Regular Releases

- The [Changesets action](https://github.com/changesets/action) automatically creates a **Version Packages** PR.
- Merging this PR triggers the release workflow, which publishes the npm packages.

## Maintenance Releases

- Enable the [`release` workflow](https://github.com/vercel/ai/blob/main/.github/workflows/release.yml) on the maintenance branch.
- Only `patch` releases are allowed.
- To release:
  1. Create a pull request against the maintenance branch.
  2. Merge it to trigger the release workflow.

## Beta / Pre-Release Cycle

For starting and managing a major-version pre-release cycle (beta releases on `main` while maintaining stable patches), see **[Pre-Release Cycle](./pre-release-cycle.md)**.

Quick reference:

- Enter beta mode: `pnpm changeset pre enter beta`
- Exit beta mode: `pnpm changeset pre exit`
- Backport fixes: add the `backport` label to the merged PR
