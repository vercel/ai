import { z } from 'zod';

// Future Google server-side tools (when they become available)
const SearchGroundingParameters = z.object({
  query: z.string().describe('Search query for grounding'),
});

const SearchGroundingResult = z.object({
  results: z.array(
    z.object({
      url: z.string(),
      title: z.string(),
      snippet: z.string(),
      relevanceScore: z.number().optional(),
    }),
  ),
  totalResults: z.number().optional(),
});

function searchGroundingTool({
  maxResults = 10,
  allowedDomains,
  region,
}: {
  maxResults?: number;
  allowedDomains?: string[];
  region?: string;
} = {}): {
  type: 'provider-defined';
  id: 'google.search_grounding';
  args: {
    maxResults?: number;
    allowedDomains?: string[];
    region?: string;
  };
  parameters: typeof SearchGroundingParameters;
  executionMode: 'server';
  resultSchema: typeof SearchGroundingResult;
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
      perInputToken: number;
    };
  };
} {
  return {
    type: 'provider-defined',
    id: 'google.search_grounding',
    args: {
      maxResults,
      allowedDomains,
      region,
    },
    parameters: SearchGroundingParameters,
    executionMode: 'server',
    resultSchema: SearchGroundingResult,
    capabilities: {
      streaming: false,
      cancellable: true,
      maxExecutionTime: 30000,
      requiresSetup: false,
    },
    serverMetadata: {
      alwaysServerSide: true,
      supportsParallelExecution: true,
      costInfo: {
        perExecution: 0.001,
        perInputToken: 0,
      },
    },
  };
}

const CodeExecutionParameters = z.object({
  code: z.string().describe('Code to execute'),
  language: z.enum(['python', 'javascript']).describe('Programming language'),
});

const CodeExecutionResult = z.object({
  output: z.string(),
  error: z.string().optional(),
  executionTime: z.number().optional(),
  warnings: z.array(z.string()).optional(),
});

function codeExecutionTool({
  timeout = 30,
  allowedPackages,
  memoryLimit,
}: {
  timeout?: number;
  allowedPackages?: string[];
  memoryLimit?: number;
} = {}): {
  type: 'provider-defined';
  id: 'google.code_execution';
  args: {
    timeout?: number;
    allowedPackages?: string[];
    memoryLimit?: number;
  };
  parameters: typeof CodeExecutionParameters;
  executionMode: 'server';
  resultSchema: typeof CodeExecutionResult;
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
    id: 'google.code_execution',
    args: {
      timeout,
      allowedPackages,
      memoryLimit,
    },
    parameters: CodeExecutionParameters,
    executionMode: 'server',
    resultSchema: CodeExecutionResult,
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
        perExecution: 0.002,
      },
    },
  };
}

export const googleTools = {
  // TODO: Provider-defined tools need proto format fixes
  // searchGrounding: searchGroundingTool,
  // codeExecution: codeExecutionTool,
};
