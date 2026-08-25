import {
  createCodexACP as createCodexACPHarness,
  type CodexACPHarnessSettings,
} from '../../lib/codex-acp-harness';

export function createCodexACP(
  settings: CodexACPHarnessSettings = {},
): ReturnType<typeof createCodexACPHarness> {
  const forceAuth = process.env.HARNESS_FORCE_AUTH;

  if (forceAuth == null) {
    return createCodexACPHarness(settings);
  }

  return createCodexACPHarness({
    ...settings,
    auth:
      forceAuth === 'ai-gateway'
        ? 'ai-gateway'
        : forceAuth === 'direct'
          ? 'direct'
          : settings.auth,
  });
}
