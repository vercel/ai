import { createGitHubCopilot } from './github-copilot-harness';

/**
 * Default GitHub Copilot harness instance. Equivalent to
 * `createGitHubCopilot()`.
 */
export const githubCopilot = createGitHubCopilot();

export { createGitHubCopilot } from './github-copilot-harness';
export type {
  GitHubCopilotAuthenticationMode,
  GitHubCopilotBuiltinTools,
  GitHubCopilotHarnessSettings,
} from './github-copilot-harness';
export { VERSION } from './version';
