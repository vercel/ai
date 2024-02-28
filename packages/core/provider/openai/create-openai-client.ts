import OpenAI from 'openai';

/**
 * Creates an OpenAI client (optional peer dependency) on demand.
 * This avoids error when the peer dependency is not installed and the provider is not used.
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
    OpenAI = (await import('openai')).default;
  } catch (error) {
    try {
      OpenAI = require('openai');
    } catch (error) {
      throw new Error(`Failed to load 'openai' module dynamically.`);
    }
  }

  return new OpenAI({
    apiKey,
    baseURL,
  });
}
