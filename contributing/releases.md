# Releases

## Changesets

Each pull request that modifies production code (not examples/docs) needs to have a changeset.

Unless a minor or major release is planned (often on a separate branch), changesets should be `patch` and non-breaking.

## Releasing

Patch releases can be created by merging the `Version Packages` pull requests that are automatically created by the corresponding GitHub action.
You might need to close/reopen them to trigger the workflows.
Once merged, the release action will release the npm packages.
