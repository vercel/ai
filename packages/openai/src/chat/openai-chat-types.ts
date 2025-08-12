import { JSONSchema7 } from '@ai-sdk/provider';

/**
 * OpenAI function tool definition
 */
interface OpenAIChatFunctionTool {
  type: 'function';
  function: {
    name: string;
    description: string | undefined;
    parameters: JSONSchema7;
    strict?: boolean;
  };
}

/**
 * OpenAI file search tool definition
 */
interface OpenAIChatFileSearchTool {
  type: 'file_search';
  vector_store_ids?: string[];
  max_num_results?: number;
  ranking_options?: {
    ranker?: 'auto' | 'default-2024-08-21';
  };
  filters?:
    | {
        key: string;
        type: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte';
        value: string | number | boolean;
      }
    | {
        type: 'and' | 'or';
        filters: any[];
      };
}

/**
 * User location for web search
 */
interface OpenAIChatWebSearchUserLocation {
  type?: 'approximate';
  city?: string;
  region?: string;
  country?: string;
  timezone?: string;
}

/**
 * OpenAI web search preview tool definition
 */
interface OpenAIChatWebSearchPreviewTool {
  type: 'web_search_preview';
  search_context_size?: 'low' | 'medium' | 'high';
  user_location?: OpenAIChatWebSearchUserLocation;
}

/**
 * OpenAI code interpreter tool definition
 */
interface OpenAIChatCodeInterpreterTool {
  type: 'code_interpreter';
  container: {
    type: 'auto';
    file_ids: string[];
  };
}

/**
 * Union type for all OpenAI tools
 */
export type OpenAIChatTool =
  | OpenAIChatFunctionTool
  | OpenAIChatFileSearchTool
  | OpenAIChatWebSearchPreviewTool
  | OpenAIChatCodeInterpreterTool;

/**
 * OpenAI tool choice options
 */
export type OpenAIChatToolChoice =
  | 'auto'
  | 'none'
  | 'required'
  | { type: 'function'; function: { name: string } };

/**
 * OpenAI tools array type
 */
export type OpenAIChatTools = Array<OpenAIChatTool>;
