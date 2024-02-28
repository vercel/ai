import OpenAI from 'openai';
import { loadDynamically } from '../../core/util/load-dynamically';

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
  const OpenAI = await loadDynamically('openai');
  return new OpenAI({ apiKey, baseURL });
}
