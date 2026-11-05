import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { getAzureModelEntry } from './azure-model-catalog';
import { azureSpeechSpeechModelOptionsShape } from './azure-speech-speech-model-options';

export const azureSpeechModelOptions = lazySchema(() =>
  zodSchema(
    z.strictObject({
      /**
       * API to use. Defaults to Speech for MAI-Voice models, OpenAI otherwise.
       */
      api: z.enum(['openai', 'speech']).optional(),
      ...azureSpeechSpeechModelOptionsShape(),
    }),
  ),
);

export type AzureSpeechModelOptions = InferSchema<
  typeof azureSpeechModelOptions
>;

export function getMAIVoiceModel(modelId: string) {
  return getAzureModelEntry(modelId)?.requestConfig?.speech?.voiceModel;
}
