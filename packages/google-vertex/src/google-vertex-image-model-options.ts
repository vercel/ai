import type { GoogleLanguageModelOptions } from '@ai-sdk/google';

export type GoogleVertexImageModelOptions = Omit<
  GoogleLanguageModelOptions,
  'responseModalities'
>;
