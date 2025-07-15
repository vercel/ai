import { JSONSchema7 } from '@ai-sdk/provider';

export type OpenAIResponsesPrompt = Array<OpenAIResponsesMessage>;

export type OpenAIResponsesMessage =
  | OpenAIResponsesSystemMessage
  | OpenAIResponsesUserMessage
  | OpenAIResponsesAssistantMessage
  | OpenAIResponsesFunctionCall
  | OpenAIResponsesFunctionCallOutput
  | OpenAIWebSearchCall
  | OpenAIComputerCall
  | OpenAIResponsesReasoning;

export type OpenAIResponsesSystemMessage = {
  role: 'system' | 'developer';
  content: string;
};

export type OpenAIResponsesUserMessage = {
  role: 'user';
  content: Array<
    | { type: 'input_text'; text: string }
    | { type: 'input_image'; image_url: string }
    | { type: 'input_file'; filename: string; file_data: string }
  >;
};

export type OpenAIResponsesAssistantMessage = {
  role: 'assistant';
  content: Array<
    | { type: 'output_text'; text: string }
    | OpenAIWebSearchCall
    | OpenAIComputerCall
  >;
};

export type OpenAIResponsesFunctionCall = {
  type: 'function_call';
  call_id: string;
  name: string;
  arguments: string;
};

export type OpenAIResponsesFunctionCallOutput = {
  type: 'function_call_output';
  call_id: string;
  output: string;
};

export type OpenAIWebSearchCall = {
  type: 'web_search_call';
  id: string;
  status?: string;
};

export type OpenAIComputerCall = {
  type: 'computer_call';
  id: string;
  status?: string;
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
      type: 'web_search_preview';
      search_context_size: 'low' | 'medium' | 'high';
      user_location: {
        type: 'approximate';
        city: string;
        region: string;
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
