import {
  createClaudeCodeACP as createClaudeCodeACPHarness,
  type ClaudeCodeACPHarnessSettings,
} from '../../lib/claude-code-acp-harness';

export function createClaudeCodeACP(
  settings: ClaudeCodeACPHarnessSettings = {},
): ReturnType<typeof createClaudeCodeACPHarness> {
  const forceAuth = process.env.HARNESS_FORCE_AUTH;

  if (forceAuth == null) {
    return createClaudeCodeACPHarness(settings);
  }

  return createClaudeCodeACPHarness({
    ...settings,
    auth:
      forceAuth === 'ai-gateway'
        ? 'ai-gateway'
        : forceAuth === 'direct'
          ? 'direct'
          : settings.auth,
  });
}
