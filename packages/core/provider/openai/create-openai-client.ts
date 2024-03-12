import OpenAI from 'openai';

/**
 * Creates an OpenAI client (optional peer dependency) on demand.
 *
 * This avoids error when the peer dependency is not installed and the provider is not used.
 * Support ESM and CommonJS module loading.
 * Hardcoded module name to allow for webpack bundling.
 */
export async function createOpenAIClient({
  apiKey,
  baseURL,
}: {
  apiKey: string;
  baseURL?: string;
}): Promise<OpenAI> {
  let OpenAI: any;

  try {
    // CommonJS Module loading:
    OpenAI = require('openai');
  } catch (error) {
    try {
      // attempt ES Module loading:
      OpenAI = (await import('openai')).default;
    } catch (error) {
      throw new Error(`Failed to load '${module}' module dynamically.`);
    }
  }

  return new OpenAI({ apiKey, baseURL });
}
