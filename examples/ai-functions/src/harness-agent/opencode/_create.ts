import {
  createOpenCode as createOpenCodeHarness,
  type OpenCodeHarnessSettings,
} from '@ai-sdk/harness-opencode';

export function createOpenCode(
  settings: OpenCodeHarnessSettings = {},
): ReturnType<typeof createOpenCodeHarness> {
  const forceAuth = process.env.HARNESS_FORCE_AUTH;

  if (forceAuth == null) {
    return createOpenCodeHarness(settings);
  }

  return createOpenCodeHarness({
    ...settings,
    auth: forceAuth === 'ai-gateway' ? 'ai-gateway' : 'anthropic',
  });
}
