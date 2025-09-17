# Releases

We use [the changes action](https://github.com/changesets/action) for automated releases.

## Changesets

Each pull request that modifies production code (not examples/docs) needs to have a changeset. Unless a minor or major release is planned, changesets should be `patch` and non-breaking. We have a CI check enforcing the `patch` version bump. To override it, add a `minor` or `major` label.

## Releasing

Patch releases can be created by merging the `Version Packages` pull requests that are automatically created by the corresponding GitHub action. Once merged, the release action will release the npm packages.

## Pre-releases and maintenance releases

In order to enable pre-releases and maintenance relaeses, [the `release` workflow](https://github.com/vercel/ai/blob/main/.github/workflows/release.yml) needs to be enabled on the respective branches.
