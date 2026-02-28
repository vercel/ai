/**
 * API format for routing requests to the correct backend.
 */
export type ApiFormat = 'openai' | 'anthropic';

/**
 * Detect whether a deployment should use the OpenAI or Anthropic API format.
 *
 * Checks the anthropicDeployments list first, then falls back to name-based
 * detection (claude- prefix, claude_ prefix, or exact match 'claude').
 */
export function detectApiFormat(
  deploymentName: string,
  anthropicDeployments?: string[],
): ApiFormat {
  // Check explicit anthropic deployments list first
  if (anthropicDeployments?.includes(deploymentName)) {
    return 'anthropic';
  }

  // Normalize for prefix/exact matching
  const normalized = deploymentName.toLowerCase();

  if (
    normalized.startsWith('claude-') ||
    normalized.startsWith('claude_') ||
    normalized === 'claude'
  ) {
    return 'anthropic';
  }

  return 'openai';
}
