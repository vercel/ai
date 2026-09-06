import {
  createCline as createClineHarness,
  type ClineHarnessSettings,
} from '@ai-sdk/harness-cline';

export function createCline(
  settings: ClineHarnessSettings = {},
): ReturnType<typeof createClineHarness> {
  const forceAuth = process.env.HARNESS_FORCE_AUTH;

  if (forceAuth == null) {
    return createClineHarness(settings);
  }

  return createClineHarness({
    ...settings,
    auth: forceAuth === 'ai-gateway' ? 'ai-gateway' : 'direct',
  });
}
