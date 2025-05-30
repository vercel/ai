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

const FileSearchPreviewParameters = z.object({});

function fileSearchTool({
  vectorStoreIds,
}: {
  vectorStoreIds?: string[];
} = {}): {
  type: 'provider-defined';
  id: 'openai.file_search';
  args: {};
  parameters: typeof FileSearchPreviewParameters;
} {
  return {
    type: 'provider-defined',
    id: 'openai.file_search',
    args: {
      vectorStoreIds,
    },
    parameters: FileSearchPreviewParameters,
  };
}

export const openaiTools = {
  webSearchPreview: webSearchPreviewTool,
  fileSearch: fileSearchTool,
};
