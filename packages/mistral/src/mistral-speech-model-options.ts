import { z } from 'zod/v4';

export const mistralSpeechModelOptions = z.object({});

export type MistralSpeechModelOptions = z.infer<
  typeof mistralSpeechModelOptions
>;
