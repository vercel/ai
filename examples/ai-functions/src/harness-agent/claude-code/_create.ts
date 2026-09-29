import {
  createClaudeCode as createClaudeCodeHarness,
  type ClaudeCodeHarnessSettings,
} from '@ai-sdk/harness-claude-code';

export function createClaudeCode(
  settings: ClaudeCodeHarnessSettings = {},
): ReturnType<typeof createClaudeCodeHarness> {
  const forceAuth = process.env.HARNESS_FORCE_AUTH;

  if (forceAuth == null) {
    return createClaudeCodeHarness(settings);
  }

  return createClaudeCodeHarness({
    ...settings,
    auth: forceAuth === 'ai-gateway' ? 'ai-gateway' : 'direct',
  });
}
