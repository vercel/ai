# Add new provider

## `@ai-sdk/<provider>` vs 3rd party package

Every provider is welcome to create a 3rd party package. We are happy to link to it from our documentation.

If you would prefer a 1st party `@ai-sdk/<provider>` package, please create an issue first to discuss.

## Example

https://github.com/vercel/ai/pull/18595/changes

## How

1. Create new folder `packages/<provider>`
2. Set version in `packages/<provider>/package.json` to exactly `2.0.0` — no pre-release suffix (do **not** use `2.0.0-canary.0`), even when `main` is in pre-release mode. See [When in pre-release mode](#when-in-pre-release-mode). We set version to 2.0.0 so that we can backport it up to 2 major versions.
3. Create changeset for new package with `major`
4. Add workflow serialization support to all model classes (see [providers.md#workflow-serialization](providers.md#workflow-serialization))
5. Add examples to `examples/ai-functions/src/<function>/<provider>/` depending on what model types the provider supports. Name the entry example `basic.ts` and use descriptive `kebab-case` names for the rest. Do not create flat files like `examples/ai-functions/src/generate-speech/<provider>.ts`.
6. Add documentation in `content/providers/01-ai-sdk-providers/<last number + 10>-<provider>.mdx`
7. Bootstrap the npm package and Trusted Publisher (Vercel IT team) — see [Bootstrapping a new `@ai-sdk/*` package](./releases.md#bootstrapping-a-new-ai-sdk-package). This is required before the first automated release can publish the package with provenance.

See also [providers.md](providers.md) and
[secure-url-handling.md](secure-url-handling.md) (when fetching URLs that come
from provider responses).

## When in pre-release mode

If `main` is set up to publish `beta` releases, no further action is necessary. Just make sure not to backport it to the `vX.Y` stable branch since it will result in an npm version conflict once we exit pre-release mode on `main`

> [!IMPORTANT]
> Set the initial version to plain `2.0.0`, **never** `2.0.0-canary.0` (or any other `-<tag>.N` suffix). A pre-release suffix makes the version a "premajor", and semver treats a `major`/`minor`/`patch` bump on a premajor as merely dropping the suffix — so the package gets stuck at `2.0.0-canary.N` and never advances to `3.0.0`. Starting from a plain `2.0.0`, changesets computes the first release correctly: a `major` changeset becomes `3.0.0-canary.0`.
