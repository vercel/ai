# CI and caching

GitHub Actions supplies machines, Node versions, credentials, and the merge
status. Turborepo owns task dependencies, scheduling within each machine, and
caching. Package scripts contain the commands themselves.

## Runner groups

| Group                | Checks                                                                                                                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Packages, Node 22    | Package builds, type checks, ordinary tests, workflow integration tests, repository lint/format and consistency, docs tests, bundle-size limits, and consumer bundles with Zod 3 and 4 |
| Packages, Node 24/26 | Ordinary package tests on the other supported runtimes                                                                                                                                 |
| AI, Node 22/24/26    | Node and Edge tests, each split into four shards for cold runs                                                                                                                         |
| Examples             | Application builds and independent example type checks, with two tasks at a time to bound memory                                                                                       |
| Browser tests        | RSC and DevTools browser suites in the version-matched Playwright container                                                                                                            |
| Windows              | MCP Node tests on Windows                                                                                                                                                              |
| Load-time benchmark  | Serial module-import measurements; advisory because shared-runner timing varies                                                                                                        |

The `CI passed` job requires every mandatory group to succeed, including all
matrix entries. Failure, cancellation, or an unexpected skip fails this gate.
Superseded PR runs are cancelled; pushes to release branches and main are not.

**When adopting this workflow, replace the old required CI checks in repository
rules with `CI passed`.** Keep the changeset policy and the Vercel docs deployment
check as separate requirements where applicable. Required-check settings live in
GitHub, not this file; change them when the new workflow is available.

## Commands

- `pnpm ci:check`: the primary Linux checks, excluding example applications.
- `pnpm test:ci`: package build/type/test graph, including deterministic workflow integration tests.
- `pnpm ci:examples`: example builds and type checks.
- `pnpm ci:browser`: RSC and DevTools browser checks (requires Chromium).
- `pnpm type-check:full`: all declared workspace type checks and their build prerequisites.
- `pnpm exec turbo run benchmark:load-time --concurrency=1`: import-time diagnostics.

AI's `ci:checks` override omits its ordinary `test` task because CI runs that
coverage through the shards. `pnpm test` still runs the complete AI suite locally.
RSC's default `test` command covers Node, UI, and Edge; browser checks have their
own explicit task. Code-mode's live-model suite requires Gateway credentials and
runs manually with
`AI_GATEWAY_API_KEY=... pnpm exec turbo run test:e2e --filter=@ai-sdk/code-mode`.
It is explicitly uncached; without credentials, the suite skips its live calls.

## Type checking

Each workspace checks its own files without emitting JavaScript. Framework
checks such as `svelte-check` retain their own commands. Turbo builds the current
package and workspace dependencies first so declaration files are available.
Tests that import sibling-package source use the workspace as their type-check
root; build configs retain their package output layouts. TypeScript project
references and the root solution configs are unnecessary:
package manifests are the source of dependency ordering.

A package change invalidates its checks and dependent tasks. An unrelated
provider can keep its cached result. A cold run still checks the complete graph.

## Cache ownership

- `actions/setup-node` caches downloaded pnpm dependencies. Installation still
  runs with the frozen lockfile.
- Turbo's remote cache stores completed builds, checks, and test results. Local
  `.turbo` storage is useful within a runner; it is not archived with Actions.
- Example compiler caches (`.next/cache` and `.angular/cache`) speed up changed
  builds. They are distinct from Turbo's complete-task cache.
- Diagnostic artifacts preserve failure information; jobs do not transfer build
  outputs through Actions artifacts.

OS and architecture separate platform-dependent artifacts. Test tasks also hash
`TEST_NODE_VERSION`, populated from the actual Node version. Browser checks hash
the container image version. AI test tasks hash `VITEST_SHARD`; build tasks do
not. Do not replace this with `turbo ... -- --shard`: passthrough arguments change
prerequisite build hashes too. The consumer-bundle task checks both Zod versions
without passing matrix arguments through Turbo.

Builds remain dependencies of tests even on cache hits. Do not use `--only` to
remove graph edges: the graph is also how dependency changes invalidate tests.
Mutating tasks (`clean`, snapshot updates) and timing benchmarks are not cached.
Build inputs also include package-local `.env*` files, including ignored files
that Next.js loads after Turbo computes its hash. Cache results assume declared
file and environment inputs are complete. Two
runners can still execute the same cold task before either uploads its result.

## Docs

GitHub runs the docs app's Node tests and the MDX properties-table validator. It
does not build the site or run the separate search browser regression. Vercel
owns the production build and deployment, using Turbo's `build:site` task. That
task includes the app files and the root docs/providers/cookbook content as
inputs; pinned older-version content commits are declared in the sync script.
No SDK package build is needed by the docs app.

Vercel's `apps/docs` project must include source files outside its root directory
and use the build command in `apps/docs/vercel.json`. Deployment-specific
configuration remains part of the cache key. Release/backport branches that
disable Vercel deployments deliberately have no docs production-build gate.

The optional `apps/docs/scripts/search.e2e.mjs` test accepts `DOCS_TEST_URL` and
can run against a preview. It is not currently a required CI task.

## Reviewing cache changes

Use `turbo run <task> --dry=json` to inspect task hashes and prerequisites. Check
that a changed dependency invalidates its consumers, unrelated packages retain
their hashes, different runtime/shard tests have distinct hashes, and builds
retain identical hashes across shards. Check cold execution, warm execution,
and restoration of outputs before attributing a speedup to caching.

Release builds use the same setup action and remote cache. Snapshot releases
build packages rather than rebuilding example applications.
