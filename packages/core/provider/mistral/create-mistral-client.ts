import MistralClient from '@mistralai/mistralai';
import { loadDynamically } from '../../core/util/load-dynamically';

/**
 * Creates an Mistral client (optional peer dependency) on demand.
 * This avoids error when the peer dependency is not installed and the provider is not used.
 */
export async function createMistralClient({
  apiKey,
}: {
  apiKey: string;
}): Promise<MistralClient> {
  const MistralClient = await loadDynamically('@mistralai/mistralai');
  return new MistralClient(apiKey);
}
