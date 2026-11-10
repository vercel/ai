import { openaiModelCatalog } from '@ai-sdk/openai/internal';
import { azureModelCatalog } from './azure-model-catalog';
export { azureProviderOptions } from './azure-model-catalog';

/** Backing-model metadata for documented Azure OpenAI deployments and MAI IDs.
 * Deployment names remain opaque at runtime; OpenAI adapters own their policies. */
export const azureDeploymentModelCatalog = {
  ...Object.fromEntries(
    [
      'dall-e-3',
      'dall-e-2',
      'tts-1',
      'tts-1-hd',
      'gpt-4o-mini-tts',
      'whisper-1',
      'gpt-4o-mini-transcribe',
      'gpt-4o-transcribe',
    ].map(id => [id, openaiModelCatalog[id]]),
  ),
  ...azureModelCatalog,
};
