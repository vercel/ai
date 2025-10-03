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

## Beta Releases

- Create a maintenance branch for the current stable minor version (e.g., if latest is `5.0.24`, create `release-v5.0`).
- Switch `main` branch to beta release mode:

  ```bash
  pnpm changeset pre enter beta
  ```

  (This creates a PR like #8710).

- During beta: All PRs continue to target main.
- In order to backport pull requests to the stable release, add the `backport` label. This will create a new pull request with the same changes against the stable release branch.
- To exit the beta release mode, run:

  ```bash
  pnpm changeset pre exit
  ```
