import {
  createDeepAgents as createDeepAgentsHarness,
  type DeepAgentsHarnessSettings,
} from '@ai-sdk/harness-deepagents';

export function createDeepAgents(
  settings: DeepAgentsHarnessSettings = {},
): ReturnType<typeof createDeepAgentsHarness> {
  const forceAuth = process.env.HARNESS_FORCE_AUTH;

  if (forceAuth == null) {
    return createDeepAgentsHarness(settings);
  }

  return createDeepAgentsHarness({
    ...settings,
    auth: forceAuth === 'ai-gateway' ? 'ai-gateway' : 'anthropic',
  });
}
