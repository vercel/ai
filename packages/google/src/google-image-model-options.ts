import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { GoogleLanguageModelOptions } from './google-language-model-options';
import {
  googleSearchToolArgsBaseSchema,
  type GoogleSearchToolArgs,
} from './tool/google-search';

export const googleImageModelOptionsSchema = lazySchema(() =>
  zodSchema(
    z.object({
      /**
       * Enable Google Search grounding for Gemini image models. The value is
       * forwarded as the args of the `google.tools.googleSearch` provider
       * tool on the underlying language-model call. Pass `{}` for defaults.
       *
       * `generateImage` does not accept a `tools` parameter, so this is the
       * dedicated escape hatch for grounding image generation the same way
       * `generateText` does.
       */
      googleSearch: googleSearchToolArgsBaseSchema.optional(),
    }),
  ),
);

export type GoogleImageModelOptions = Omit<
  GoogleLanguageModelOptions,
  'responseModalities'
> & {
  googleSearch?: GoogleSearchToolArgs;
};
