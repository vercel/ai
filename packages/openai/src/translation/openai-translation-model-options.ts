import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export type OpenAITranslationModelId = 'gpt-realtime-translate' | (string & {});

export const openAITranslationModelOptions = lazySchema(() =>
  zodSchema(z.object({})),
);

export type OpenAITranslationModelOptions = InferSchema<
  typeof openAITranslationModelOptions
>;
