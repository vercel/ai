import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Mode controls (env), mirroring the original suite:
 *   RECORD=true       — record a fixture only when it is missing
 *   RECORD_ALL=true   — re-record every fixture
 *   HARNESS_E2E_LIVE=true — bypass fixtures, hit the real network
 * Pure replay (none set, fixture present) needs no model API key.
 */
export const RECORD = process.env.RECORD === 'true';
export const RECORD_ALL = process.env.RECORD_ALL === 'true';
export const LIVE = process.env.HARNESS_E2E_LIVE === 'true';

export const FIXTURES_DIR = new URL('./__fixtures__', import.meta.url).pathname;

const REPLAY_DUMMY_GATEWAY_KEY = 'replay-gateway-key';

/*
 * Read lazily so the `.env` / `.env.local` loaded by the integration setup file
 * (after this module is imported) are still picked up.
 */
function realGatewayApiKey(): string {
  return process.env.AI_GATEWAY_API_KEY ?? '';
}
function vercelOidcToken(): string {
  return process.env.VERCEL_OIDC_TOKEN ?? '';
}

/**
 * Whether the environment can provision a Vercel sandbox. Every scenario boots
 * a real sandbox (replay only cans the model HTTP, not the VM), so a scenario
 * with no recorded fixture — the synthetic error tests — still needs this to
 * run. The Vercel SDK accepts either an OIDC token or a `VERCEL_TOKEN`.
 */
export function hasVercelCredential(): boolean {
  return (
    vercelOidcToken().length > 0 || (process.env.VERCEL_TOKEN ?? '').length > 0
  );
}

/**
 * Gate for scenarios served by an always-synthetic handler (no fixture, never
 * recorded) — the `invalid-credentials` / `unknown-model` error tests. They
 * need a sandbox but no model credential, so they run whenever a sandbox can be
 * provisioned, independent of `RECORD`/`LIVE`.
 */
export function shouldRunSyntheticScenario(): boolean {
  return hasVercelCredential();
}

export type RunMode = 'record' | 'replay' | 'live';

/**
 * Credential the AI Gateway is reached with. Exactly one field is set:
 * `apiKey` (an `AI_GATEWAY_API_KEY`, or a dummy on replay) or `oidcToken` (the
 * Vercel OIDC token already present for sandbox provisioning). Both are sent to
 * the gateway as a bearer credential; the per-adapter wiring differs only in
 * how each underlying CLI carries it.
 */
export interface GatewayCredential {
  apiKey?: string;
  oidcToken?: string;
}

export function fixturePath(adapterName: string, scenario: string): string {
  return join(FIXTURES_DIR, `${adapterName}-${scenario}.json`);
}

/**
 * Decide how a scenario runs, or `'skip'` when there is nothing to do:
 *   - LIVE → always `'live'` (explicit intent).
 *   - RECORD_ALL, or RECORD without a fixture → always `'record'` (explicit
 *     intent).
 *   - otherwise `'replay'` if the fixture exists, else `'skip'`.
 *
 * Credential presence is deliberately NOT consulted here: an explicit record /
 * live request must never be silently skipped for missing credentials — that
 * masks a misconfiguration. The credential is resolved at run time by
 * {@link resolveGatewayCredential}, which throws a clear error if it is absent.
 * (Resolving at run time also means the `.env.local` the integration setup file
 * loads is in place, unlike at collection time when `skipIf` is evaluated.)
 *
 * Replay still boots a real sandbox (Vercel credentials are inferred from the
 * environment); only the model HTTP is canned.
 */
export function resolveRunMode(
  adapterName: string,
  scenario: string,
): RunMode | 'skip' {
  if (LIVE) {
    return 'live';
  }
  const fixtureExists = existsSync(fixturePath(adapterName, scenario));
  if (RECORD_ALL || (RECORD && !fixtureExists)) {
    return 'record';
  }
  return fixtureExists ? 'replay' : 'skip';
}

export function shouldRunScenario(
  adapterName: string,
  scenario: string,
): boolean {
  return resolveRunMode(adapterName, scenario) !== 'skip';
}

/**
 * The gateway credential to configure the adapter with for a run mode. Replay
 * never touches the network (the fixture is served), so a dummy api key
 * suffices. Record/live prefer an explicit `AI_GATEWAY_API_KEY`, falling back to
 * the ambient Vercel OIDC token — and throw if neither is set, so an explicit
 * record/live run fails loudly rather than recording an empty fixture.
 */
export function resolveGatewayCredential(mode: RunMode): GatewayCredential {
  if (mode === 'replay') {
    return { apiKey: REPLAY_DUMMY_GATEWAY_KEY };
  }
  const apiKey = realGatewayApiKey();
  if (apiKey) {
    return { apiKey };
  }
  const oidcToken = vercelOidcToken();
  if (oidcToken) {
    return { oidcToken };
  }
  throw new Error(
    `Run mode "${mode}" needs a gateway credential, but neither AI_GATEWAY_API_KEY ` +
      `nor VERCEL_OIDC_TOKEN is set. Add one to tools/harness-e2e/.env.local ` +
      `(or export it) before recording or running live.`,
  );
}

/**
 * Lease a unique (bridge, proxy-ws) port pair per session within this process,
 * so concurrent scenarios in the same worker don't collide. Two of Vercel's
 * four-port max are used by a proxied session.
 */
let portCounter = 0;
export function leaseSessionPorts(): {
  bridgePort: number;
  proxyWsPort: number;
} {
  const base = 4100 + portCounter * 2;
  portCounter += 1;
  return { bridgePort: base, proxyWsPort: base + 1 };
}
