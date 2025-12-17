import {
  createProviderDefinedToolFactory,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

// https://cloud.google.com/vertex-ai/generative-ai/docs/grounding/web-grounding-enterprise

export const enterpriseWebSearch = createProviderDefinedToolFactory<
  {
    // Enterprise Web Search does not have any input schema
  },
  {}
>({
  id: 'google.enterprise_web_search',
  name: 'enterprise_web_search',
  inputSchema: lazySchema(() => zodSchema(z.object({}))),
});
