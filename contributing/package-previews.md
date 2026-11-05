# Package previews

Install unpublished AI SDK packages directly from a pull request's Vercel
preview deployment. These tarballs replace the npm snapshot release option
previously available in `release.yml`. They are never published to npm.

## Install a preview

1. Open the Vercel bot comment on the PR and select the **ai-tarballs** deployment.
2. Open the package browser and copy its generated npm or pnpm install command.
3. Use the deployment's unique URL when sharing a specific revision. A branch
   alias follows subsequent pushes and should not be saved in dependencies.

For example, substituting the deployment's actual origin:

```sh
npm install ai@https://ai-tarballs-abc123-vercel-labs.vercel.app/pkg/ai.tgz @ai-sdk/openai@https://ai-tarballs-abc123-vercel-labs.vercel.app/pkg/ai-sdk/openai.tgz
```

Downloads use `/pkg/ai.tgz` for `ai` and `/pkg/ai-sdk/<name>.tgz` for scoped
packages such as `@ai-sdk/openai`. The browser lists every public package and
provides install commands including any required internal peer packages.
`/catalog.json` exposes the same metadata, commit SHA, integrity hashes, download
URLs, and install commands for agents.

Each package has version `0.0.0-preview.<full Git commit SHA>`. Internal runtime
and optional dependencies point to tarballs from that same immutable Vercel
deployment. Internal peers use the matching preview version; generated install
commands include those peers explicitly.

pnpm 12 blocks transitive tarball URLs by default. Generated pnpm commands
include `--config.blockExoticSubdeps=false` for that installation. This does not
change persistent pnpm settings. Review the PR before installing its packages.

To return to a release, replace the preview URL dependencies with npm versions
and reinstall. Keep preview packages out of production applications.

## Approval and deployment lifecycle

The project follows [`vercel/workflow`'s tarball
setup](https://github.com/vercel/workflow/tree/main/tarballs): Vercel's Git
integration builds on branch pushes and manages the PR deployment comment.
The comment shows the pending/building, ready, or failed deployment state. Open
its ai-tarballs URL for install commands.

**Git Fork Protection must remain enabled.** A Vercel team member must authorize
fork PR deployments through Vercel. This approval is separate from approving
GitHub Actions. The build can run alongside GitHub CI and does not wait for CI
to pass. A ready deployment means the tarball build succeeded; consult the PR's
CI results and package preview checks separately before relying on a preview.

Vercel packages the Git commit identified by `VERCEL_GIT_COMMIT_SHA`, rather than
GitHub's synthetic PR merge commit. The catalog records that exact commit and,
when available, the branch and PR number. Builds made before a PR is opened,
and production-branch builds, also have a package browser.

Use the generated immutable deployment URL. The custom
`pr-<number>-<branch>-<sha>.tarballs.ai-sdk.dev` aliases are no longer assigned.
Vercel's generated branch aliases may change their destination on later pushes;
all internal tarball links always use the immutable `VERCEL_URL` origin.
Deployments remain available according to the project's deployment retention
policy, so preview URLs are intended for temporary testing.

After each successful deployment, Vercel sends a `vercel.deployment.success`
repository dispatch. `.github/workflows/tarballs.yml` filters events to the
ai-tarballs project, downloads all packages, checks their integrity and manifests,
and verifies isolated npm/pnpm installs and runtime imports. This workflow has
read-only GitHub permissions and no Vercel credentials. Its result is separate
from Vercel's build status. Automatic dispatch checks start once the workflow is
on the default branch. After that, `workflow_dispatch` accepts a deployment URL
and its full commit SHA for manual checks and retries. Before the first merge,
run the smoke script locally against the public deployment URL.

## Build process

The project's root directory is `tools/tarballs`. Its `vercel.json` installs the
workspace dependencies from the repository root and runs `node build.mjs`.
Enable Vercel's **Include source files outside of the Root Directory** setting so
the build can access `packages/`, the root lockfile, and workspace configuration.

`build.mjs` reads Vercel's system Git variables and unique deployment URL.
`pack.mjs` sets preview versions before building because the bundler embeds
package versions, builds the public packages, rewrites internal dependency URLs,
and runs `pnpm pack`. Original package manifests are restored even on failure.
The initial install verifies the frozen lockfile. While manifests contain
temporary preview versions, packaging disables pnpm's automatic dependency
reinstallation for its build and pack subprocesses.
`site.mjs` writes the tarballs, package browser, and catalog into `dist/`. The
result is a static deployment with no runtime functions.

There is no GitHub-to-Vercel token exchange, deploy action, custom alias step, or
static deployment token. Keep this dedicated project free of application
credentials and third-party integrations: builds execute contribution code.

## Maintainer setup

Use the existing [ai-tarballs project in
vercel-labs](https://vercel.com/vercel-labs/ai-tarballs):

1. Connect its Git repository to **vercel/ai**. Use production branch **main**,
   root directory **tools/tarballs**, framework **Other**, and Node.js **22.x**.
2. Enable **Include source files outside of the Root Directory** and automatic
   exposure of system environment variables. Use the install/build/output
   settings from `tools/tarballs/vercel.json`; remove older dashboard overrides
   that disabled installation or building.
3. Keep **Git Fork Protection enabled**. Review a fork contribution before
   authorizing its deployment. GitHub CI approvals remain independent.
4. Keep deployment downloads public, including previews, so npm and pnpm can
   fetch packages without login or a bypass secret. Keep build logs and source
   protection enabled. Do not add application secrets to the project.
5. Keep Vercel's PR comments and repository dispatch events enabled. The smoke
   workflow filters the dedicated project ID. Update that filter if the project
   is ever replaced. `changeset-release/*` branches are excluded in `vercel.json`.
6. Deploy this PR and verify its package browser, public downloads, and isolated
   installs. After merge, verify dispatch-triggered smoke checks on another PR,
   including a fork that requires Vercel authorization.

The root `package.json` also declares supported Node.js versions. Vercel may
select a newer version allowed by `engines.node` over the project's setting;
check the deployment build logs for the actual runtime.

The former `TARBALLS_ENABLED`, `TARBALLS_VERCEL_*` GitHub variables and `tarballs`
GitHub environment are unused. No Vercel CLI OIDC policy or audience is required
for this setup. An existing unused OIDC policy can be removed by its owner.
The wildcard `*.tarballs.ai-sdk.dev` domain is also unnecessary for generated
Vercel deployment URLs.

## Local validation

```sh
node --test tools/tarballs/*.test.mjs
```

To build locally after `pnpm install`, provide the same public metadata that
Vercel supplies. Use an origin that will serve the resulting files:

```sh
VERCEL_URL=localhost:8443 \
VERCEL_GIT_COMMIT_SHA=$(git rev-parse HEAD) \
VERCEL_GIT_COMMIT_REF=$(git branch --show-current) \
node tools/tarballs/build.mjs
```

Serve `tools/tarballs/dist/` over HTTPS at that origin, applying the response
headers declared in `vercel.json`. The smoke check validates those headers as
well as package contents:

```sh
TARBALLS_URL=https://localhost:8443 \
TARBALLS_SHA=$(git rev-parse HEAD) \
node tools/tarballs/smoke.mjs
```

Use a trusted local certificate for both the Node.js fetches and package
managers. Neither command needs a Vercel token.
