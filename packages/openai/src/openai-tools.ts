import { z } from 'zod';

const WebSearchPreviewParameters = z.object({});

const WebSearchPreviewResult = z.object({
  results: z.array(
    z.object({
      url: z.string(),
      title: z.string(),
      content: z.string(),
      publishedDate: z.string().optional(),
    }),
  ),
  searchQuery: z.string(),
  totalResults: z.number().optional(),
});

function webSearchPreviewTool({
  searchContextSize = 'medium',
  userLocation,
  maxResults = 10,
}: {
  searchContextSize?: 'low' | 'medium' | 'high';
  userLocation?: {
    type?: 'approximate';
    city?: string;
    region?: string;
    country?: string;
    timezone?: string;
  };
  maxResults?: number;
} = {}): {
  type: 'provider-defined';
  id: 'openai.web_search_preview';
  args: {
    searchContextSize?: 'low' | 'medium' | 'high';
    userLocation?: {
      type?: 'approximate';
      city?: string;
      region?: string;
      country?: string;
      timezone?: string;
    };
    maxResults?: number;
  };
  parameters: typeof WebSearchPreviewParameters;
  executionMode: 'server';
  resultSchema: typeof WebSearchPreviewResult;
  capabilities: {
    streaming: boolean;
    cancellable: boolean;
    maxExecutionTime: number;
    requiresSetup: boolean;
  };
  serverMetadata: {
    alwaysServerSide: boolean;
    supportsParallelExecution: boolean;
    costInfo: {
      perExecution: number;
    };
  };
} {
  return {
    type: 'provider-defined',
    id: 'openai.web_search_preview',
    args: {
      searchContextSize,
      userLocation,
      maxResults,
    },
    parameters: WebSearchPreviewParameters,
    executionMode: 'server',
    resultSchema: WebSearchPreviewResult,
    capabilities: {
      streaming: false,
      cancellable: true,
      maxExecutionTime: 15000,
      requiresSetup: false,
    },
    serverMetadata: {
      alwaysServerSide: true,
      supportsParallelExecution: true,
      costInfo: {
        perExecution: 0.005,
      },
    },
  };
}

// Future OpenAI server-side tools (when they become available)
const CodeInterpreterParameters = z.object({
  code: z.string().describe('Python code to execute'),
});

const CodeInterpreterResult = z.object({
  output: z.string(),
  error: z.string().optional(),
  files: z
    .array(
      z.object({
        name: z.string(),
        content: z.string(),
        type: z.string(),
      }),
    )
    .optional(),
  plots: z
    .array(
      z.object({
        format: z.string(),
        data: z.string(),
      }),
    )
    .optional(),
});

function codeInterpreterTool({
  timeout = 60,
  packages,
  allowPlots = true,
}: {
  timeout?: number;
  packages?: string[];
  allowPlots?: boolean;
} = {}): {
  type: 'provider-defined';
  id: 'openai.code_interpreter';
  args: {
    timeout?: number;
    packages?: string[];
    allowPlots?: boolean;
  };
  parameters: typeof CodeInterpreterParameters;
  executionMode: 'server';
  resultSchema: typeof CodeInterpreterResult;
  capabilities: {
    streaming: boolean;
    cancellable: boolean;
    maxExecutionTime: number;
    requiresSetup: boolean;
  };
  serverMetadata: {
    alwaysServerSide: boolean;
    supportsParallelExecution: boolean;
    costInfo: {
      perExecution: number;
    };
  };
} {
  return {
    type: 'provider-defined',
    id: 'openai.code_interpreter',
    args: {
      timeout,
      packages,
      allowPlots,
    },
    parameters: CodeInterpreterParameters,
    executionMode: 'server',
    resultSchema: CodeInterpreterResult,
    capabilities: {
      streaming: true,
      cancellable: true,
      maxExecutionTime: timeout * 1000,
      requiresSetup: false,
    },
    serverMetadata: {
      alwaysServerSide: true,
      supportsParallelExecution: false,
      costInfo: {
        perExecution: 0.01,
      },
    },
  };
}

const FileSearchParameters = z.object({
  query: z.string().describe('Search query for file contents'),
});

const FileSearchResult = z.object({
  results: z.array(
    z.object({
      fileName: z.string(),
      content: z.string(),
      relevanceScore: z.number().optional(),
      fileType: z.string().optional(),
    }),
  ),
  totalResults: z.number().optional(),
});

function fileSearchTool({
  maxResults = 20,
  fileTypes,
  includeContent = true,
}: {
  maxResults?: number;
  fileTypes?: string[];
  includeContent?: boolean;
} = {}): {
  type: 'provider-defined';
  id: 'openai.file_search';
  args: {
    maxResults?: number;
    fileTypes?: string[];
    includeContent?: boolean;
  };
  parameters: typeof FileSearchParameters;
  executionMode: 'server';
  resultSchema: typeof FileSearchResult;
  capabilities: {
    streaming: boolean;
    cancellable: boolean;
    maxExecutionTime: number;
    requiresSetup: boolean;
  };
  serverMetadata: {
    alwaysServerSide: boolean;
    supportsParallelExecution: boolean;
    costInfo: {
      perExecution: number;
    };
  };
} {
  return {
    type: 'provider-defined',
    id: 'openai.file_search',
    args: {
      maxResults,
      fileTypes,
      includeContent,
    },
    parameters: FileSearchParameters,
    executionMode: 'server',
    resultSchema: FileSearchResult,
    capabilities: {
      streaming: false,
      cancellable: true,
      maxExecutionTime: 10000,
      requiresSetup: true,
    },
    serverMetadata: {
      alwaysServerSide: true,
      supportsParallelExecution: true,
      costInfo: {
        perExecution: 0.003,
      },
    },
  };
}

export const openaiTools = {
  webSearchPreview: webSearchPreviewTool,
  fileSearch: fileSearchTool,
  // Future tools (commented out until OpenAI implements them)
};
