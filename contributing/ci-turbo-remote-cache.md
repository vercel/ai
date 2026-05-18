# Turbo remote cache in CI

CI uses [Vercel Remote Cache](https://vercel.com/docs/monorepos/remote-caching) via Turborepo.

## GitHub configuration

| Name          | Type     | Value                                                                    |
| ------------- | -------- | ------------------------------------------------------------------------ |
| `TURBO_TOKEN` | Secret   | Vercel access token with remote cache write access                       |
| `TURBO_TEAM`  | Variable | Vercel team **slug** (URL segment after `vercel.com/`, not display name) |

Workflow sets both at the top of `.github/workflows/ci.yml`. Jobs use `pnpm run build:packages:ci` and `pnpm test:ci` so Turbo reads/writes local + remote cache.

## Rotate `TURBO_TOKEN` when cache writes fail

If CI logs show:

```text
WARNING  Insufficient permissions to write to remote cache
Cached:    0 cached, 111 total
```

1. Confirm [Remote Caching is enabled](https://vercel.com/docs/monorepos/remote-caching#enable-and-disable-remote-caching-for-your-team) for the Vercel team.
2. Create a new token:
   - Prefer a **team-scoped** token from the team settings, or
   - A [scoped account token](https://vercel.com/account/tokens) with access to the team and permission to manage **Remote Cache** artifacts ([team roles](https://vercel.com/docs/accounts/team-members-and-roles/access-roles/team-level-roles)).
3. Update the `TURBO_TOKEN` repository secret.
4. Re-run CI and check the **Run tests** step summary for `Cached: N cached` with `N > 0` on an unchanged tree.

## Verify locally

```bash
export TURBO_TOKEN=...
export TURBO_TEAM=your-team-slug
pnpm run build:packages:ci
pnpm test:ci
```

Second run on the same tree should report cache hits in the Turbo summary.
