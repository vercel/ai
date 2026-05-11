import { z } from 'zod/v4';

export const deepinfraLanguageModelChatOptions = z.object({});

export type DeepInfraLanguageModelChatOptions = z.infer<
  typeof deepinfraLanguageModelChatOptions
>;
