import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
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

// Azure voice-name suffixes by lowercase model ID.
const maiVoiceModels = new Map([
  ['mai-voice-2-flash', 'MAI-Voice-2-Flash'],
  ['mai-voice-2', 'MAI-Voice-2'],
  ['mai-voice-1', 'MAI-Voice-1'],
]);

export function getMAIVoiceModel(modelId: string) {
  return maiVoiceModels.get(modelId.toLowerCase());
}
