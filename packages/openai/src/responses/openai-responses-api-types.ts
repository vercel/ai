import { JSONSchema7 } from '@ai-sdk/provider';

export type OpenAIResponsesInput = Array<OpenAIResponsesInputItem>;

export type OpenAIResponsesInputItem =
  | OpenAIResponsesSystemMessage
  | OpenAIResponsesUserMessage
  | OpenAIResponsesAssistantMessage
  | OpenAIResponsesFunctionCall
  | OpenAIResponsesFunctionCallOutput
  | OpenAIResponsesComputerCall
  | OpenAIResponsesReasoning
  | OpenAIResponsesItemReference;

export type OpenAIResponsesIncludeOptions =
  | Array<
      | 'web_search_call.action.sources'
      | 'code_interpreter_call.outputs'
      | 'computer_call_output.output.image_url'
      | 'file_search_call.results'
      | 'message.input_image.image_url'
      | 'message.output_text.logprobs'
      | 'reasoning.encrypted_content'
    >
  | undefined
  | null;

export type OpenAIResponsesSystemMessage = {
  role: 'system' | 'developer';
  content: string;
};

export type OpenAIResponsesUserMessage = {
  role: 'user';
  content: Array<
    | { type: 'input_text'; text: string }
    | { type: 'input_image'; image_url: string }
    | { type: 'input_image'; file_id: string }
    | { type: 'input_file'; file_url: string }
    | { type: 'input_file'; filename: string; file_data: string }
    | { type: 'input_file'; file_id: string }
  >;
};

export type OpenAIResponsesAssistantMessage = {
  role: 'assistant';
  content: Array<{ type: 'output_text'; text: string }>;
  id?: string;
};

export type OpenAIResponsesFunctionCall = {
  type: 'function_call';
  call_id: string;
  name: string;
  arguments: string;
  id?: string;
};

export type OpenAIResponsesFunctionCallOutput = {
  type: 'function_call_output';
  call_id: string;
  output: string;
};

export type OpenAIResponsesComputerCall = {
  type: 'computer_call';
  id: string;
  status?: string;
};

export type OpenAIResponsesItemReference = {
  type: 'item_reference';
  id: string;
};

export type OpenAIResponsesTool =
  | {
      type: 'function';
      name: string;
      description: string | undefined;
      parameters: JSONSchema7;
      strict?: boolean;
    }
  | {
      type: 'web_search';
      filters?: {
        allowed_domains?: string[];
      };
      search_context_size: 'low' | 'medium' | 'high' | undefined;
      user_location:
        | {
            type: 'approximate';
            city?: string;
            country?: string;
            region?: string;
            timezone?: string;
          }
        | undefined;
    }
  | {
      type: 'web_search_preview';
      search_context_size: 'low' | 'medium' | 'high' | undefined;
      user_location:
        | {
            type: 'approximate';
            city?: string;
            country?: string;
            region?: string;
            timezone?: string;
          }
        | undefined;
    }
  | {
      type: 'code_interpreter';
      container: string | { type: 'auto'; file_ids: string[] | undefined };
    }
  | {
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
    };

export type OpenAIResponsesReasoning = {
  type: 'reasoning';
  id: string;
  encrypted_content?: string | null;
  summary: Array<{
    type: 'summary_text';
    text: string;
  }>;
};
