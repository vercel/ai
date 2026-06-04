import type { HarnessV1 } from '@ai-sdk/harness';
import { createClaudeCode } from '@ai-sdk/harness-claude-code';
import { createCodex } from '@ai-sdk/harness-codex';
import { createPi } from '@ai-sdk/harness-pi';
import type { GatewayCredential } from './e2e-shared';

export type ReplayInterception = 'proxy' | 'host-fetch';

export interface ReplayAdapter {
  /** Adapter id; also the fixture filename prefix. */
  readonly name: string;
  /** How this adapter's model HTTP is intercepted. */
  readonly interception: ReplayInterception;
  /** For host-fetch adapters: hostnames routed through the engine. */
  readonly interceptHosts?: ReadonlyArray<string>;
  /** Build the harness pinned to a deterministic model + gateway auth. */
  readonly createHarness: (credential: GatewayCredential) => HarnessV1;
}

/*
 * Gateway base URLs match each adapter's own gateway default so the recorded
 * request origin (part of the replay match key) is stable across record/replay.
 * Codex's OpenAI-compatible gateway path expects the `/v1` suffix.
 */
const ANTHROPIC_GATEWAY_BASE_URL = 'https://ai-gateway.vercel.sh';
const OPENAI_GATEWAY_BASE_URL = 'https://ai-gateway.vercel.sh/v1';

/** Single bearer token both api-key and OIDC reduce to (for codex/pi). */
function bearer(credential: GatewayCredential): string {
  return credential.apiKey ?? credential.oidcToken ?? '';
}

/**
 * The three implemented adapters, each pinned for deterministic replay: a fixed
 * model and gateway-routed auth. The credential is real when recording and a
 * dummy api key when replaying (the proxy/host-fetch serves the model HTTP from
 * the fixture, so its value is irrelevant on replay). Codex and Pi use their
 * default models; claude-code pins one explicitly.
 *
 * Auth wiring differs by how each underlying CLI carries the credential to the
 * gateway: codex (OpenAI-style) and pi both send `Authorization: Bearer`, so the
 * token rides as the gateway api key. claude-code uses the Anthropic SDK, which
 * sends an api key as `x-api-key` but an *auth token* as `Authorization: Bearer`
 * — and the gateway accepts an OIDC token only as a bearer — so an OIDC
 * credential is wired through the `anthropic.authToken` path.
 */
export const REPLAY_ADAPTERS: ReadonlyArray<ReplayAdapter> = [
  {
    name: 'claude-code',
    interception: 'proxy',
    createHarness: credential =>
      createClaudeCode({
        model: 'claude-sonnet-4-5',
        auth: credential.apiKey
          ? {
              gateway: {
                apiKey: credential.apiKey,
                baseUrl: ANTHROPIC_GATEWAY_BASE_URL,
              },
            }
          : {
              anthropic: {
                authToken: credential.oidcToken ?? '',
                baseUrl: ANTHROPIC_GATEWAY_BASE_URL,
              },
            },
      }),
  },
  {
    name: 'codex',
    interception: 'proxy',
    createHarness: credential =>
      createCodex({
        auth: {
          gateway: {
            apiKey: bearer(credential),
            baseUrl: OPENAI_GATEWAY_BASE_URL,
          },
        },
      }),
  },
  {
    name: 'pi',
    interception: 'host-fetch',
    interceptHosts: ['ai-gateway.vercel.sh'],
    createHarness: credential =>
      createPi({
        auth: {
          gateway: {
            apiKey: bearer(credential),
            baseUrl: ANTHROPIC_GATEWAY_BASE_URL,
          },
        },
      }),
  },
];

export function getReplayAdapter(name: string): ReplayAdapter {
  const adapter = REPLAY_ADAPTERS.find(entry => entry.name === name);
  if (adapter == null) {
    throw new Error(`Unknown replay adapter: ${name}`);
  }
  return adapter;
}
