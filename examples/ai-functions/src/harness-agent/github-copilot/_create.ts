import {
  createGitHubCopilot as createGitHubCopilotHarness,
  type GitHubCopilotHarnessSettings,
} from '@ai-sdk/harness-github-copilot';

export function createGitHubCopilot(
  settings: GitHubCopilotHarnessSettings = {},
): ReturnType<typeof createGitHubCopilotHarness> {
  const forceAuth = process.env.HARNESS_FORCE_AUTH;

  return createGitHubCopilotHarness({
    ...settings,
    auth:
      forceAuth === 'ai-gateway'
        ? 'ai-gateway'
        : forceAuth === 'direct'
          ? 'direct'
          : settings.auth,
  });
}

export function getGitHubCopilotExampleModel(): string {
  return process.env.GITHUB_COPILOT_EXAMPLE_MODEL ?? 'gpt-5.5';
}
