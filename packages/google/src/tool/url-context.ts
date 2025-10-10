import {
  createProviderDefinedToolFactory,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import * as z from 'zod/v4';

export const urlContext = createProviderDefinedToolFactory<
  {
    // Url context does not have any input schema, it will directly use the url from the prompt
  },
  {}
>({
  id: 'google.url_context',
  name: 'url_context',
  inputSchema: lazySchema(() => zodSchema(z.object({}))),
});
