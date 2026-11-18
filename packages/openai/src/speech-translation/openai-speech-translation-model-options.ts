import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { OpenAIModelIds } from '../openai-model-catalog';

export type OpenAISpeechTranslationModelId =
  | OpenAIModelIds['speechTranslation']
  | (string & {});

export const openAISpeechTranslationModelOptions = lazySchema(() =>
  zodSchema(z.object({})),
);

export type OpenAISpeechTranslationModelOptions = InferSchema<
  typeof openAISpeechTranslationModelOptions
>;
