import {
  createPi as createPiHarness,
  type PiHarnessSettings,
} from '@ai-sdk/harness-pi';

export function createPi(
  settings: PiHarnessSettings = {},
): ReturnType<typeof createPiHarness> {
  const forceAuth = process.env.HARNESS_FORCE_AUTH;

  if (forceAuth == null) {
    return createPiHarness(settings);
  }

  return createPiHarness({
    ...settings,
    auth: forceAuth === 'ai-gateway' ? 'ai-gateway' : 'anthropic',
  });
}
