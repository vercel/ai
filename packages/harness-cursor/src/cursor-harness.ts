import { createAcpHarness } from "@ai-sdk/harness-acp";
import type { HarnessV1 } from "@ai-sdk/harness";

import { createCursorAcpExtensions, type CursorAcpExtensionSettings } from "./cursor-acp-extensions.js";
import { getCursorBootstrap } from "./cursor-bootstrap.js";
import { resolveCursorEnv, type CursorAuthOptions } from "./cursor-auth.js";

const DEFAULT_CURSOR_MODEL = "default";

export type CursorHarnessSettings = CursorAcpExtensionSettings & {
  readonly auth?: CursorAuthOptions;
  readonly model?: string;
  readonly startupTimeoutMs?: number;
};

export function createCursor(settings: CursorHarnessSettings = {}): HarnessV1 {
  const env = resolveCursorEnv(settings.auth);

  return createAcpHarness({
    harnessId: "cursor",
    getBootstrap: getCursorBootstrap,
    command: "agent acp",
    authMethodId: "cursor_login",
    model: settings.model ?? DEFAULT_CURSOR_MODEL,
    env,
    startupTimeoutMs: settings.startupTimeoutMs,
    registerRpcHandlers: createCursorAcpExtensions(settings),
  });
}