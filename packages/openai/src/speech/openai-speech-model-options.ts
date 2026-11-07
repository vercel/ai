import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export type OpenAISpeechModelId =
  | 'tts-1'
  | 'tts-1-1106'
  | 'tts-1-hd'
  | 'tts-1-hd-1106'
  | 'gpt-4o-mini-tts'
  | 'gpt-4o-mini-tts-2025-03-20'
  | 'gpt-4o-mini-tts-2025-12-15'
  | (string & {});

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
