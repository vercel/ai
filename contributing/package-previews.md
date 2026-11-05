# Package previews

The `ai-tarballs` Vercel project builds unpublished packages for this release
branch and its pull requests, using the same tooling as `main`.

Open **ai-tarballs** in the Vercel bot comment on a PR and copy the generated npm
or pnpm install command from the package browser. Use the immutable deployment
URL when sharing a revision. The catalog at `/catalog.json` records the exact Git
commit and the download URLs and integrity hashes of every public package.

Preview packages use `0.0.0-preview.<full Git commit SHA>`. Internal runtime
and optional dependencies point to the same deployment, and internal peers use
the matching preview version. They are never published to npm.

The project root is `tools/tarballs`. Vercel installs workspace dependencies
from the repository root, builds public packages, and serves the generated static
site and tarballs. Fork deployments still require Vercel team approval. Successful
deployments are checked by the default branch's isolated package preview workflow.

Run the tooling tests with `node --test tools/tarballs/*.test.mjs`. For local build,
smoke-check commands, and maintainer setup, see the [package preview guide on
main](https://github.com/vercel/ai/blob/main/contributing/package-previews.md).
