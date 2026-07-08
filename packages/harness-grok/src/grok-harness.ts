import { createAcpHarness } from "@ai-sdk/harness-acp";
import type { HarnessV1 } from "@ai-sdk/harness";

import { getGrokBootstrap, GROK_CLI } from "./grok-bootstrap.js";
import {
  resolveGrokAuthMethodId,
  resolveGrokEnv,
  type GrokAuthOptions,
} from "./grok-auth.js";

const DEFAULT_GROK_MODEL = "grok-build-0.1";

export type GrokHarnessSettings = {
  readonly auth?: GrokAuthOptions;
  readonly model?: string;
  readonly port?: number;
  readonly startupTimeoutMs?: number;
};

export function createGrok(settings: GrokHarnessSettings = {}): HarnessV1 {
  const authMethodId = resolveGrokAuthMethodId(settings.auth);
  const env = resolveGrokEnv(settings.auth);
  const hasApiKey = Boolean(env.XAI_API_KEY);

  return createAcpHarness({
    harnessId: "grok",
    getBootstrap: getGrokBootstrap,
    command: `${GROK_CLI} --no-auto-update agent stdio`,
    authMethodId,
    ...(hasApiKey ? { authMeta: { headless: true } } : {}),
    model: settings.model ?? DEFAULT_GROK_MODEL,
    ...(hasApiKey ? { env } : {}),
    startupTimeoutMs: settings.startupTimeoutMs,
  });
}