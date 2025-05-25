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

const MCPParameters = z.object({});

function mcpTool({
  serverLabel,
  serverUrl,
  allowedTools,
  requireApproval,
}: {
  serverLabel: string;
  serverUrl: string;
  allowedTools?: string[];
  headers?: Record<string, string>;
  requireApproval?:
    | 'always'
    | 'never'
    | {
        always?: {
          toolNames?: string[];
        };
        never?: {
          toolNames?: string[];
        };
      };
}): {
  type: 'provider-defined';
  id: 'openai.mcp';
  args: {
    serverLabel: string;
    serverUrl: string;
    allowedTools?: string[];
    requireApproval?:
      | 'always'
      | 'never'
      | {
          always?: {
            toolNames?: string[];
          };
          never?: {
            toolNames?: string[];
          };
        };
  };
  parameters: typeof MCPParameters;
} {
  return {
    type: 'provider-defined',
    id: 'openai.mcp',
    args: {
      serverLabel,
      serverUrl,
      allowedTools,
      requireApproval,
    },
    parameters: MCPParameters,
  };
}

export const openaiTools = {
  webSearchPreview: webSearchPreviewTool,
  mcp: mcpTool,
};
