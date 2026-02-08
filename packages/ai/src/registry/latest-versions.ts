/**
 * Maps provider and model base names to their latest versions.
 * This allows using `--latest` suffix to automatically resolve to the newest model version.
 * 
 * Usage: 'anthropic:claude-sonnet--latest' -> 'anthropic:claude-sonnet-4-5'
 */
export const LATEST_VERSIONS: Record<string, Record<string, string>> = {
  anthropic: {
    'claude-opus': 'claude-opus-4-1',
    'claude-sonnet': 'claude-sonnet-4-5',
    'claude-haiku': 'claude-haiku-4-5',
  },
  openai: {
    'gpt': 'gpt-4.5',
    'gpt-mini': 'gpt-4.5-mini',
    'o1': 'o1',
    'o1-mini': 'o1-mini',
    'o3-mini': 'o3-mini',
  },
  google: {
    'gemini-pro': 'gemini-2.0-flash-exp',
    'gemini-flash': 'gemini-2.0-flash-exp',
  },
  'google-vertex': {
    'gemini-pro': 'gemini-2.0-flash-exp',
    'gemini-flash': 'gemini-2.0-flash-exp',
  },
  cohere: {
    'command': 'command-r-plus-08-2024',
    'command-r': 'command-r-08-2024',
  },
  mistral: {
    'mistral-large': 'mistral-large-latest',
    'mistral-small': 'mistral-small-latest',
    'mistral-medium': 'mistral-medium-latest',
  },
  groq: {
    'llama': 'llama-3.3-70b-versatile',
    'mixtral': 'mixtral-8x7b-32768',
  },
  deepseek: {
    'deepseek-chat': 'deepseek-chat',
    'deepseek-reasoner': 'deepseek-reasoner',
  },
  xai: {
    'grok': 'grok-2-latest',
  },
};

/**
 * Resolves a model ID with --latest suffix to its actual latest version.
 * 
 * @param providerId - The provider identifier (e.g., 'anthropic', 'openai')
 * @param modelId - The model identifier, potentially with --latest suffix
 * @returns The resolved model ID, or the original if --latest not used
 * 
 * @example
 * resolveLatestVersion('anthropic', 'claude-sonnet--latest') 
 * // Returns: 'claude-sonnet-4-5'
 * 
 * resolveLatestVersion('openai', 'gpt-4o') 
 * // Returns: 'gpt-4o' (unchanged)
 */
export function resolveLatestVersion(
  providerId: string,
  modelId: string,
): string {
  // Check if the model ID ends with --latest
  if (!modelId.endsWith('--latest')) {
    return modelId;
  }

  // Extract the base model name by removing --latest suffix
  const baseModel = modelId.slice(0, -('--latest'.length));

  // Look up the latest version for this provider and base model
  const providerVersions = LATEST_VERSIONS[providerId];
  if (!providerVersions) {
    // Provider not in mapping, return original modelId
    // This allows --latest to pass through to providers that support it natively
    return modelId;
  }

  const resolvedVersion = providerVersions[baseModel];
  if (!resolvedVersion) {
    // Base model not in mapping, return original modelId
    return modelId;
  }

  return resolvedVersion;
}
