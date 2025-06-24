import { z } from 'zod';

const WebSearchPreviewParameters = z.object({});

function webSearchPreviewTool({
  searchContextSize,
  userLocation,
}: {
  searchContextSize?: 'low' | 'medium' | 'high';
  userLocation?: {
    type?: 'approximate';
    city?: string;
    region?: string;
    country?: string;
    timezone?: string;
  };
} = {}): {
  type: 'provider-defined';
  id: 'openai.web_search_preview';
  args: {};
  parameters: typeof WebSearchPreviewParameters;
} {
  return {
    type: 'provider-defined',
    id: 'openai.web_search_preview',
    args: {
      searchContextSize,
      userLocation,
    },
    parameters: WebSearchPreviewParameters,
  };
}

const CodeInterpreterParameters = z.object({});

function codeInterpreterTool({}: {} = {}): {
  type: 'provider-defined';
  id: 'openai.code_interpreter';
  args: {};
  parameters: typeof CodeInterpreterParameters;
} {
  return {
    type: 'provider-defined',
    id: 'openai.code_interpreter',
    args: {},
    parameters: CodeInterpreterParameters,
  };
}

export const openaiTools = {
  webSearchPreview: webSearchPreviewTool,
  codeInterpreter: codeInterpreterTool,
};
