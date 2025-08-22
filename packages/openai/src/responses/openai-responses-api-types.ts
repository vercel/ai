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
  | OpenAIFileSearchCall
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
    | { type: 'input_image'; file_id: string }
    | { type: 'input_file'; file_url: string }
    | { type: 'input_file'; filename: string; file_data: string }
    | { type: 'input_file'; file_id: string }
  >;
};

export type OpenAIResponsesAssistantMessage = {
  role: 'assistant';
  content: Array<
    | { type: 'output_text'; text: string }
    | OpenAIWebSearchCall
    | OpenAIComputerCall
    | OpenAIFileSearchCall
  >;
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

export type OpenAIFileSearchCall = {
  type: 'file_search_call';
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

export type OpenAIResponsesToolChoice =
  | OpenAIResponsesToolChoiceOptions
  | OpenAIResponsesToolChoiceAllowed
  | OpenAIResponsesToolChoiceTypes
  | OpenAIResponsesToolChoiceFunction
  | OpenAIResponsesToolChoiceMcp
  | OpenAIResponsesToolChoiceCustom;

/**
 * Constrains the tools available to the model to a pre-defined set.
 */
export type OpenAIResponsesToolChoiceAllowed = {
  /**
   * Constrains the tools available to the model to a pre-defined set.
   *
   * `auto` allows the model to pick from among the allowed tools and generate a
   * message.
   *
   * `required` requires the model to call one or more of the allowed tools.
   */
  mode: 'auto' | 'required';

  /**
   * A list of tool definitions that the model should be allowed to call.
   *
   * For the Responses API, the list of tool definitions might look like:
   *
   * ```json
   * [
   *   { "type": "function", "name": "get_weather" },
   *   { "type": "mcp", "server_label": "deepwiki" },
   *   { "type": "image_generation" }
   * ]
   * ```
   */
  tools: Array<{ [key: string]: unknown }>;

  /**
   * Allowed tool configuration type. Always `allowed_tools`.
   */
  type: 'allowed_tools';
};

/**
 * Use this option to force the model to call a specific custom tool.
 */
export type OpenAIResponsesToolChoiceCustom = {
  /**
   * The name of the custom tool to call.
   */
  name: string;

  /**
   * For custom tool calling, the type is always `custom`.
   */
  type: 'custom';
};

/**
 * Use this option to force the model to call a specific function.
 */
export type OpenAIResponsesToolChoiceFunction = {
  /**
   * The name of the function to call.
   */
  name: string;

  /**
   * For function calling, the type is always `function`.
   */
  type: 'function';
};

/**
 * Use this option to force the model to call a specific tool on a remote MCP
 * server.
 */
export type OpenAIResponsesToolChoiceMcp = {
  /**
   * The label of the MCP server to use.
   */
  server_label: string;

  /**
   * For MCP tools, the type is always `mcp`.
   */
  type: 'mcp';

  /**
   * The name of the tool to call on the server.
   */
  name?: string | null;
};

/**
 * Controls which (if any) tool is called by the model.
 *
 * `none` means the model will not call any tool and instead generates a message.
 *
 * `auto` means the model can pick between generating a message or calling one or
 * more tools.
 *
 * `required` means the model must call one or more tools.
 */
export type OpenAIResponsesToolChoiceOptions = 'none' | 'auto' | 'required';

/**
 * Indicates that the model should use a built-in tool to generate a response.
 * [Learn more about built-in tools](https://platform.openai.com/docs/guides/tools).
 */
export type OpenAIResponsesToolChoiceTypes = {
  /**
   * The type of hosted tool the model should to use. Learn more about
   * [built-in tools](https://platform.openai.com/docs/guides/tools).
   *
   * Allowed values are:
   *
   * - `file_search`
   * - `web_search_preview`
   * - `computer_use_preview`
   * - `code_interpreter`
   * - `mcp`
   * - `image_generation`
   */
  type:
    | 'file_search'
    | 'web_search_preview'
    | 'computer_use_preview'
    | 'image_generation'
    | 'code_interpreter'
    | 'mcp';
};
