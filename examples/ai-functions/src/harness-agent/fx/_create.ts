import {
  createFx as createFxHarness,
  type FxHarnessSettings,
} from '@ai-sdk/harness-fx';

export function createFx(
  settings: FxHarnessSettings = {},
): ReturnType<typeof createFxHarness> {
  const forceAuth = process.env.HARNESS_FORCE_AUTH;

  if (forceAuth == null) {
    return createFxHarness(settings);
  }

  return createFxHarness({
    ...settings,
    auth:
      forceAuth === 'ai-gateway'
        ? 'ai-gateway'
        : forceAuth === 'direct'
          ? 'direct'
          : settings.auth,
  });
}
