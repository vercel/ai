# Consumer bundle tests

These tests install packed SDK packages in a temporary directory outside the
monorepo, build a Next.js app with production webpack optimizations, and execute
both the server and browser bundles. They complement unit tests, the example
builds, and the esbuild size checks, which do not execute a production consumer's
browser bundle.

```sh
pnpm install
pnpm exec turbo build --filter=ai --filter=@ai-sdk/openai
pnpm exec playwright install chromium
pnpm test:bundlers
# Or run just one supported peer-dependency boundary:
pnpm test:bundlers 4.1.8
```

The two lanes install Zod 3.25.76 and 4.1.8, the minimum supported versions of
each major. Each lane exercises both `zod/v3` and `zod/v4`, including the v4
implementation shipped inside Zod 3. The fixture pins Next.js, React, and its
type-checking dependencies; other transitive dependencies resolve at install
time. No API keys or live model calls are needed.

The runner packs `ai`, `@ai-sdk/openai`, and their recursive workspace
dependencies. It overrides every selected SDK dependency with the local tarball,
including transitive dependencies. The consumer checks that package entry points
resolve to built output inside its own installation. It has no workspace links,
source aliases, or access to the monorepo's `node_modules` through ancestor paths.
`transpilePackages` forces webpack to process the published SDK output on the
server as well as the client.

The server test exercises JSON Schema conversion, valid and invalid input,
lazy UI-message validation, and `generateText`/`streamText` through the real
OpenAI adapter with fixed JSON/SSE responses. The browser test clicks a button
after hydration to initialize and validate schemas in Chromium, asserting the
result and checking for browser errors. Each `next build` also type-checks the
fixture against the installed package declarations.

CI runs both lanes after the SDK package build and includes them in the required
`test` aggregate. Playwright retains failure traces; the runner retains failed
consumer installations and prints their locations for local investigation.

## Relationship to #9388

This is compatibility coverage motivated by
[the Zod import regression](https://github.com/vercel/ai/issues/9388), not a
confirmed reproduction of it. The issue and revert do not identify the exact
failing bundler configuration. An initial experiment with the affected
`ai@5.0.62` and `@ai-sdk/provider-utils@3.0.11` passed basic schema checks in
esbuild and webpack bundles. Before claiming that #9388 is fixed, add a fixture
that fails with those releases and passes with the import revert under the same
configuration. Keep that historical reproduction separate from these tests of
the current checkout. Additional bundlers can be added as separate fixtures.
