import MistralClient from '@mistralai/mistralai';

/**
 * Creates an Mistral client (optional peer dependency) on demand.
 *
 * This avoids error when the peer dependency is not installed and the provider is not used.
 * Support ESM and CommonJS module loading.
 * Hardcoded module name to allow for webpack bundling.
 */
export async function createMistralClient({
  apiKey,
}: {
  apiKey: string;
}): Promise<MistralClient> {
  let MistralClient: any;

  try {
    // CommonJS Module loading:
    MistralClient = require('@mistralai/mistralai').default;
  } catch (error) {
    try {
      // attempt ES Module loading:
      MistralClient = (await import('@mistralai/mistralai')).default;
    } catch (error) {
      throw new Error(`Failed to load '${module}' module dynamically.`);
    }
  }

  return new MistralClient(apiKey);
}
