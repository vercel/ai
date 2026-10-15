# Consumer bundle tests

These tests install packed SDK packages in a temporary directory outside the
monorepo and use Node's built-in test runner to execute a Next.js production
server bundle and a browser-targeted esbuild bundle. They complement unit tests,
the example builds, and the esbuild size checks by executing optimized consumer
output. The suite does not use Playwright or install a browser.

```sh
pnpm install
pnpm exec turbo build --filter=ai --filter=@ai-sdk/openai
pnpm test:bundlers
# Or run just one supported peer-dependency boundary:
pnpm test:bundlers 4.1.8
```

The two lanes install Zod 3.25.76 and 4.1.8, the minimum supported versions of
each major. Each lane exercises both `zod/v3` and `zod/v4`, including the v4
implementation shipped inside Zod 3. The fixture pins Next.js, React, esbuild,
and its type-checking dependencies; other transitive dependencies resolve at
install time. No API keys or live model calls are needed.

The runner packs `ai`, `@ai-sdk/openai`, and their recursive workspace
dependencies. It overrides every selected SDK dependency with the local tarball,
including transitive dependencies. The consumer checks that package entry points
resolve to built output inside its own installation. It has no workspace links,
source aliases, or access to the monorepo's `node_modules` through ancestor paths.
`transpilePackages` forces webpack to process the published SDK output in the
Next.js server bundle.

The server test exercises JSON Schema conversion, valid and invalid input,
lazy UI-message validation, and `generateText`/`streamText` through the real
OpenAI adapter with fixed JSON/SSE responses. It serves the production build
using Next.js's custom server API on an automatically assigned port, then makes
an HTTP request. It waits for the server's listening event without startup polling.
Each `next build` also type-checks the fixture against the installed declarations.

The second test builds the same schema checks with esbuild's browser target,
minification, and tree shaking enabled, asserts that the output has no external
imports, then executes it in Node. The schema operations do not need DOM APIs.
This covers browser-targeted bundling and runtime schema initialization; it does
not test an actual browser, React hydration, or Next.js's client runtime.

CI runs both lanes after the SDK package build and includes them in the required
`test` aggregate. Failures appear in the Node test output; the runner retains
failed consumer installations and prints their locations for local investigation.

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
