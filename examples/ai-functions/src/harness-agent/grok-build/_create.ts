import {
  createGrokBuild as createGrokBuildHarness,
  type GrokBuildHarnessSettings,
} from '@ai-sdk/harness-grok-build';

export function createGrokBuild(
  settings: GrokBuildHarnessSettings = {},
): ReturnType<typeof createGrokBuildHarness> {
  const forceAuth = process.env.HARNESS_FORCE_AUTH;

  if (forceAuth == null) {
    return createGrokBuildHarness(settings);
  }

  return createGrokBuildHarness({
    ...settings,
    auth:
      forceAuth === 'ai-gateway'
        ? 'ai-gateway'
        : forceAuth === 'direct'
          ? 'direct'
          : settings.auth,
  });
}
