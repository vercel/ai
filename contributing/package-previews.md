# Pull request package previews

Package previews let contributors and agents install the packages built from a
pull request before an npm release. A single bot comment on the PR shows progress,
then links to the package browser and install commands when verification passes.

These previews replace the npm snapshot release option previously available in
`release.yml`. To test a PR, use the preview linked in its comment instead of
manually dispatching a snapshot release or installing from npm's `snapshot` tag.
The release workflow continues to publish regular npm releases.

For external contributors, a maintainer must first approve the GitHub Actions CI
run. **All CI jobs must pass** before the preview workflow creates a deployment
or posts its first comment. Opening a PR alone does not deploy anything.

## Installing a preview

Use the URL in the PR comment. For example:

```sh
npm install ai@https://pr-12345-fix-provider-options-0123456789ab.tarballs.ai-sdk.dev/pkg/ai.tgz @ai-sdk/openai@https://pr-12345-fix-provider-options-0123456789ab.tarballs.ai-sdk.dev/pkg/ai-sdk/openai.tgz
```

The browser lists every public package with npm and pnpm commands. Commands for
packages with internal peer dependencies include the matching peers explicitly.
Internal runtime and optional dependencies already point to the same preview, so
installing a provider also installs its preview of `@ai-sdk/provider-utils` and
`@ai-sdk/provider`. External dependencies retain their normal version ranges.

pnpm 12 blocks transitive tarball URLs by default. The generated pnpm commands
include `--config.blockExoticSubdeps=false` to allow the preview's internal tarball
dependencies for that invocation. This also permits other transitive URL/git
dependencies during that install, so review the PR and dependency changes first.
It does not change persistent pnpm settings. Use the same flag for subsequent
pnpm installs while consuming a preview, or use npm. Remove the preview dependencies
when returning to released packages.

For agents, fetch `<preview-origin>/catalog.json`. It contains the PR number,
branch, head SHA, tested merge SHA, originating CI run and attempt, package names,
versions, URLs, SHA-512 integrity values, sizes, dependency relationships, and
per-package install commands. Package paths are stable:

| Package                  | Download path                    |
| ------------------------ | -------------------------------- |
| `ai`                     | `/pkg/ai.tgz`                    |
| `@ai-sdk/openai`         | `/pkg/ai-sdk/openai.tgz`         |
| `@ai-sdk/provider-utils` | `/pkg/ai-sdk/provider-utils.tgz` |

Preview packages are unreleased PR code. Review the changes before installing.
They use `0.0.0-pr.<number>.<full-tested-sha>` versions and are never published to
the npm registry. Restore released versions when finished testing.

## URL identity and retries

The hostname is:

```text
pr-<PR number>-<normalized branch>-<12-character tested SHA>.tarballs.ai-sdk.dev
```

Branch names become lowercase ASCII letters, digits, and single hyphens. Leading
and trailing hyphens are removed; an empty result becomes `branch`. Only the
branch segment is truncated to fit DNS's 63-character label limit.

The SHA identifies the exact synthetic merge commit tested by PR CI, including
the current base branch. It can differ from the PR head SHA; both are shown in the
catalog and comment. Updating the PR or its base requires a new passing CI run.
An obsolete run cannot update the current PR comment or publish a stale revision.

Once assigned, a hostname is immutable. A retry verifies and reuses the existing
preview. It refuses to retarget an unavailable alias or one with different full
commit identities, including a short-SHA collision. The old successful preview
remains linked with its SHA while a newer preview is preparing or has failed.
Deployment retention in Vercel still applies: immutability does not guarantee
indefinite availability.

## How publishing works

The design follows the static tarball previews in
[`vercel/workflow`](https://github.com/vercel/workflow/tree/9d0f748a1cccf67b275ad5b902123d6ca714c2c9/tarballs),
with publishing gated on approved, passing AI SDK CI instead of automatic Git
deployments.

1. `CI` records the PR head, base, tested merge, and run identity in an artifact.
   This context job performs no checkout and executes no PR code.
2. `.github/workflows/tarballs.yml` runs on `workflow_run: completed` from the
   **default branch**. It accepts successful pull-request `CI` runs only. It
   verifies the run's repository, workflow path, attempt, head repository and
   branch, current open PR head/base, merge commit parents, and the successful
   aggregate `test` job through the GitHub API. Artifact metadata alone cannot
   authorize a deployment. Partial reruns without a successful aggregate `test`
   job and a context artifact for that attempt fail closed; rerun **all jobs**.
3. A trusted job creates or updates one `github-actions[bot]` PR comment to show
   that the preview is preparing. Comment state prevents an older CI run or
   attempt from overwriting a newer status. Closed or updated PRs are skipped.
4. A separate runner checks out the verified merge commit, installs the frozen
   lockfile, sets preview versions **before** building (the version is embedded
   by tsdown), then rewrites package dependencies and runs `pnpm pack` for every
   public package. This runner has no publishing credentials, write token,
   OIDC permission, remote Turbo cache, or protected environment.
5. A fresh trusted runner rechecks CI and the current PR, validates the artifact
   filenames, sizes, versions, and hashes, and constructs its own Vercel Build
   Output API directory. It copies only `.tgz` bytes and generates the HTML,
   catalog, routing config, and project link itself. Symlinks and unexpected files
   are rejected. It never extracts tarballs or executes PR code. The Vercel token
   is available only to this static upload/alias step.
6. A fresh runner without deployment credentials downloads every public tarball,
   checks integrity and package manifests, and runs isolated npm and pnpm installs
   plus runtime imports of `ai` and `@ai-sdk/openai`. It also exercises internal
   peer dependencies through `@ai-sdk/code-mode` when present. Install scripts are
   disabled. Only then does a separate trusted job mark the comment ready. Failure
   and cancellation update the same comment with a workflow link.

Publishing is serialized per source repository/branch. No untrusted artifact,
cache, Vercel function, `vercel.json`, lifecycle hook, or generated script is
executed on the credentialed publisher. Only default-branch tooling is trusted;
changes to this tooling require maintainer review before merging.

## Deployment authentication (rollout blocker)

The current publisher expects the `TARBALLS_VERCEL_TOKEN` environment secret,
which would be a persistent Vercel access token. **Do not provision that secret
or enable previews.** Deployment authentication must use short-lived credentials
before rollout.

The intended flow is for the trusted `publish` job to request a GitHub Actions
OIDC identity and exchange it for short-lived Vercel deployment credentials.
The Vercel trust policy must restrict access to this repository, this workflow
on `main`, the protected `tarballs` environment, and the dedicated `ai-tarballs`
project. The exchange must authorize the publisher's project/environment checks,
alias lookups, prebuilt upload, and alias assignment. Only the publishing job may
request an OIDC identity; the runner executing PR code must remain unprivileged.

Vercel's [October 2026 authentication update](https://vercel.com/blog/death-to-long-lived-static-credentials)
describes API and CLI deployment OIDC support as being extended. The public
[CLI authentication documentation](https://vercel.com/docs/cli/global-options#token)
still documents access tokens for CI. Confirm the supported inbound GitHub OIDC
exchange with the Vercel platform team before implementing it. Runtime OIDC
federation and Trusted Sources access to protected deployments do not themselves
authorize creating deployments or assigning aliases. Do not substitute a
GitHub ID token for `VERCEL_TOKEN` without a supported exchange.

## Maintainer setup

Keep `TARBALLS_ENABLED` unset or `false` until every step below is complete.

1. In repository **Settings → Actions → General → Approval for running fork pull
   request workflows from contributors**, choose **Require approval for all
   external contributors**. The API value is `all_external_contributors`:

   ```sh
   gh api repos/vercel/ai/actions/permissions/fork-pr-contributor-approval \
     -X PUT -f approval_policy=all_external_contributors
   gh api repos/vercel/ai/actions/permissions/fork-pr-contributor-approval
   ```

   First-time-only approval policies do not satisfy this requirement. Keep the
   setting enforced operationally; `GITHUB_TOKEN` cannot read this administration
   setting during publishing. Do not enable write tokens or secrets for fork PR
   CI. Approving CI is the maintainer's authorization to build that contribution.

2. Use **[`ai-tarballs` in `vercel-labs`](https://vercel.com/vercel-labs/ai-tarballs)**
   (or create it when bootstrapping), with framework **Other**, **no Git
   repository integration**, and no build/runtime environment variables. Disable
   Vercel Authentication, password protection, and other deployment protection
   for this dedicated public package project. Never connect automatic Git builds
   or put application secrets in this project.
3. Add `*.tarballs.ai-sdk.dev` to the project. Complete ownership verification and
   the DNS/nameserver configuration Vercel requests, including wildcard TLS.
   Wildcard domains can require Vercel nameservers or delegation; confirm the
   wildcard is verified rather than adding a CNAME alone. Individual deployments
   receive individual aliases under this wildcard.
4. Create a GitHub environment named **`tarballs`**. Restrict deployment branches
   to **`main`** using a custom branch policy; the `workflow_run` publisher runs on
   the default branch even for fork PRs. Additional environment reviewers are
   optional because the build and credentialed upload run on separate runners.
5. In that environment, configure these variables:

   | Name                         | Value                    |
   | ---------------------------- | ------------------------ |
   | `TARBALLS_VERCEL_ORG_ID`     | `vercel-labs` team ID    |
   | `TARBALLS_VERCEL_PROJECT_ID` | `ai-tarballs` project ID |

6. Resolve the [deployment authentication blocker](#deployment-authentication-rollout-blocker),
   configure the inbound trust policy, and verify that short-lived credentials
   support every publisher operation. Remove the workflow's static secret
   reference. Vercel CLI is pinned in the workflow; review and test version
   updates before enabling them.
7. Merge the workflow/tooling to `main`, then set the **repository variable**
   `TARBALLS_ENABLED=true`. `workflow_run` cannot bootstrap itself from this PR.
   Rerun **all jobs** of a test PR's CI after merge so that the context artifact
   and aggregate `test` result belong to the same attempt.
8. Verify an external PR remains awaiting approval without a preview/comment;
   approve CI and verify the preparing → ready comment and public npm/pnpm
   downloads. Also verify failed CI creates no deployment, and a new commit
   cannot reuse or overwrite an older commit's hostname.

Disable new previews immediately by setting `TARBALLS_ENABLED=false`. Existing
public deployments remain available. Manage expiry/deletion in the dedicated
Vercel project; do not reassign an old hostname to new package bytes.

## Local validation

```sh
node --test tools/tarballs/*.test.mjs
pnpm type-check:full
```

The tests cover hostname/path validation, dependency and peer rewriting,
GitHub run/revision gating, comment transitions, static artifact rejection,
HTML escaping, and a real build/`pnpm pack` fixture with embedded preview versions.
End-to-end public download and install checks run in the preview workflow after
the project, domain, and environment have been configured.
