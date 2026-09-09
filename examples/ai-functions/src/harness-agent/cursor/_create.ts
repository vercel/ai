import {
  createCursor as createCursorHarness,
  type CursorHarnessSettings,
} from '@ai-sdk/harness-cursor';

export function createCursor(
  settings: CursorHarnessSettings = {},
): ReturnType<typeof createCursorHarness> {
  const forceAuth = process.env.HARNESS_FORCE_AUTH;

  if (forceAuth == null) {
    return createCursorHarness(settings);
  }

  return createCursorHarness({
    ...settings,
    auth:
      forceAuth === 'ai-gateway'
        ? 'ai-gateway'
        : forceAuth === 'direct'
          ? 'direct'
          : settings.auth,
  });
}
