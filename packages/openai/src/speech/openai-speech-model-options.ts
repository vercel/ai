import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { OpenAIModelIds } from '../openai-model-catalog';

export type OpenAISpeechModelId = OpenAIModelIds['speech'] | (string & {});

// https://platform.openai.com/docs/api-reference/audio/createSpeech
/**
 * Shape of the OpenAI speech model options. Exported so that routers that
 * also call the OpenAI speech API (e.g. Azure) can accept these options under
 * their own providerOptions key.
 */
export const openaiSpeechModelOptionsShape = () => ({
  instructions: z.string().nullish(),
  speed: z.number().min(0.25).max(4.0).nullish(),
});

export const openaiSpeechModelOptionsSchema = lazySchema(() =>
  zodSchema(z.object(openaiSpeechModelOptionsShape())),
);

export type OpenAISpeechModelOptions = InferSchema<
  typeof openaiSpeechModelOptionsSchema
>;
