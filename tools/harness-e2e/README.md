# harness-e2e

Internal, unshipped **real-CLI E2E adapter regression suite** (§23). It runs the
real harness adapters end-to-end against a real sandbox, records their LLM HTTP
traffic as fixtures once, and replays it deterministically — so the adapters can
be proven to "keep working" with no API cost and no live inference. The
regression class it catches: the underlying CLI/SDK's actual event shapes (which
drift across versions) and our adapter's translation of them.

Not published. Not part of `pnpm test`.

## How it works

The fixture engine (`src/http-fixture*.ts`, `src/record-replay-handler.ts`)
records/replays HTTP at one seam — a handler with the shape
`(Request) => Promise<Response>`. Two interceptors feed it:

- **proxy** (`claude-code`, `codex`): the in-sandbox MITM proxy
  (`harness-http-proxy`) tunnels the bridge/CLI's model HTTP to the host handler.
  Scoped to the bridge spawn, so the harness bootstrap installs the CLI over a
  clean network.
- **host-fetch** (`pi`): pi runs the model on the host, so a scoped
  `globalThis.fetch` override intercepts it; the sandbox is still used for
  filesystem/shell.

Matching is method + normalized-route, then a 4-tier body match (exact →
canonical → semantic → first-turn), with volatile-value normalization, secret
redaction (audited at save time), and synthetic route policies for non-model
endpoints (telemetry, metrics, MCP registry, title generation).

## Credentials

Recording (and live) authenticate to the Vercel AI Gateway, preferring an
`AI_GATEWAY_API_KEY` and otherwise the **Vercel OIDC token** (`VERCEL_OIDC_TOKEN`)
that's already present for sandbox provisioning. Put credentials in this
package's own env files (loaded by `vitest.integration.setup.ts`):

- `tools/harness-e2e/.env.local` — `VERCEL_OIDC_TOKEN` (preferred)
- `tools/harness-e2e/.env` — `AI_GATEWAY_API_KEY` (optional; takes precedence)

Vercel sandbox credentials are inferred from the environment. **Pure replay needs
no model credential**, but still boots a real sandbox (so Vercel creds are
required even on replay).

## Running

```bash
# Engine unit tests (fast, no sandbox, no creds) — part of `pnpm test`
pnpm --filter harness-e2e test

# Replay the recorded suite (no model key needed)
pnpm --filter harness-e2e test:integration

# Replay a subset (vitest -t matches describe/test names)
pnpm --filter harness-e2e test:integration -t "core: claude-code"

# Record missing fixtures / re-record everything (needs creds)
RECORD=true     pnpm --filter harness-e2e test:integration
RECORD_ALL=true pnpm --filter harness-e2e test:integration

# Bypass fixtures and hit the real network (needs creds)
HARNESS_E2E_LIVE=true pnpm --filter harness-e2e test:integration
```

A replay miss throws with a body diff and the exact re-record command. The suite
is also the first implementor of the root turbo `test:integration` task
(`turbo run test:integration --filter=harness-e2e`).

## Not promised

Replay is **not hermetic and not sub-second**: it boots a real sandbox VM
(~30–60s per test) and reaches the Vercel control plane every run. Only the
*LLM* HTTP is canned — it removes API cost and nondeterminism, not VM latency.
There is no CI workflow yet.

## Coverage

Coverage is **feature-bounded**: it reproduces every original e2e scenario for
the three implemented adapters whose feature exists in the reimplementation.
Scenarios that exercise an unimplemented feature are not stubbed here — each is
tracked in `KEY_REQUIREMENTS_AND_GAPS.md` under the owning gap (tool filtering
§26, hooks §31, structured output §32, USD budget §11, approvals §13, subagents
§15) and lands with that feature.
