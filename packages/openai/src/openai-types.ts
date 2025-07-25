import { JSONSchema7 } from '@ai-sdk/provider';

/**
 * OpenAI function tool definition
 */
export interface OpenAIFunctionTool {
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
export interface OpenAIFileSearchTool {
  type: 'file_search';
  vector_store_ids?: string[];
  max_num_results?: number;
  ranking_options?: {
    ranker?: 'auto' | 'keyword' | 'semantic';
  };
}

/**
 * User location for web search
 */
export interface OpenAIWebSearchUserLocation {
  type?: 'approximate';
  city?: string;
  region?: string;
  country?: string;
  timezone?: string;
}

/**
 * OpenAI web search preview tool definition
 */
export interface OpenAIWebSearchPreviewTool {
  type: 'web_search_preview';
  search_context_size?: 'low' | 'medium' | 'high';
  user_location?: OpenAIWebSearchUserLocation;
}

/**
 * Union type for all OpenAI tools
 */
export type OpenAITool =
  | OpenAIFunctionTool
  | OpenAIFileSearchTool
  | OpenAIWebSearchPreviewTool;

/**
 * OpenAI tool choice options
 */
export type OpenAIToolChoice =
  | 'auto'
  | 'none'
  | 'required'
  | { type: 'function'; function: { name: string } };

/**
 * OpenAI tools array type
 */
export type OpenAITools = Array<OpenAITool>;
