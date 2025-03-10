import { z } from 'zod';

const WebSearchParameters = z.object({});

function webSearchTool(): {
  type: 'provider-defined';
  id: 'openai.web_search';
  args: {};
  parameters: typeof WebSearchParameters;
} {
  return {
    type: 'provider-defined',
    id: 'openai.web_search',
    args: {},
    parameters: WebSearchParameters,
  };
}

export const openaiTools = {
  web_search: webSearchTool,
};
