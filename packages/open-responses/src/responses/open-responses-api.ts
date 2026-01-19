import { JSONSchema7 } from '@ai-sdk/provider';
import { lazySchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { zodSchema } from '@ai-sdk/provider-utils';

export const openResponsesErrorSchema = lazySchema(() =>
  zodSchema(
    z.object({
      error: z.object({
        message: z.string(),
        type: z.string(),
        param: z.string(),
        code: z.string(),
      }),
    }),
  ),
);

// ============================================================================
// Enums
// ============================================================================

/**
 * The status of a function call or message item.
 */
export type FunctionCallStatus = 'in_progress' | 'completed' | 'incomplete';

/**
 * Image detail level for input images.
 */
export type ImageDetail = 'low' | 'high' | 'auto';

/**
 * Reasoning effort level.
 */
export type ReasoningEffortEnum = 'none' | 'low' | 'medium' | 'high' | 'xhigh';

/**
 * Reasoning summary level.
 */
export type ReasoningSummaryEnum = 'concise' | 'detailed' | 'auto';

/**
 * Tool choice value enum.
 */
export type ToolChoiceValueEnum = 'none' | 'auto' | 'required';

/**
 * Verbosity level for text output.
 */
export type VerbosityEnum = 'low' | 'medium' | 'high';

// ============================================================================
// Content Types
// ============================================================================

/**
 * A text input to the model.
 */
export type InputTextContentParam = {
  type: 'input_text';
  text: string;
};

/**
 * An image input to the model.
 */
export type InputImageContentParam = {
  type: 'input_image';
  image_url?: string;
  detail?: ImageDetail;
};

/**
 * A file input to the model.
 */
export type InputFileContentParam = {
  type: 'input_file';
  filename?: string;
  file_data?: string;
  file_url?: string;
};

/**
 * A video input to the model.
 */
export type InputVideoContent = {
  type: 'input_video';
  video_url: string;
};

/**
 * A text output from the model.
 */
export type OutputTextContentParam = {
  type: 'output_text';
  text: string;
  annotations?: UrlCitationParam[];
};

/**
 * A refusal from the model.
 */
export type RefusalContentParam = {
  type: 'refusal';
  refusal: string;
};

/**
 * A URL citation annotation.
 */
export type UrlCitationParam = {
  type: 'url_citation';
  start_index: number;
  end_index: number;
  url: string;
  title: string;
};

/**
 * Reasoning summary content.
 */
export type ReasoningSummaryContentParam = {
  type: 'summary_text';
  text: string;
};

// ============================================================================
// Message Item Types
// ============================================================================

/**
 * An internal identifier for an item to reference.
 */
export type ItemReferenceParam = {
  type?: 'item_reference';
  id: string;
};

/**
 * A reasoning item.
 */
export type ReasoningItemParam = {
  id?: string;
  type: 'reasoning';
  summary: ReasoningSummaryContentParam[];
  content?: unknown;
  encrypted_content?: string;
};

/**
 * A user message item.
 */
export type UserMessageItemParam = {
  id?: string;
  type: 'message';
  role: 'user';
  content:
  | string
  | Array<
    InputTextContentParam | InputImageContentParam | InputFileContentParam
  >;
  status?: string;
};

/**
 * A system message item.
 */
export type SystemMessageItemParam = {
  id?: string;
  type: 'message';
  role: 'system';
  content: string | InputTextContentParam[];
  status?: string;
};

/**
 * A developer message item.
 */
export type DeveloperMessageItemParam = {
  id?: string;
  type: 'message';
  role: 'developer';
  content: string | InputTextContentParam[];
  status?: string;
};

/**
 * An assistant message item.
 */
export type AssistantMessageItemParam = {
  id?: string;
  type: 'message';
  role: 'assistant';
  content: string | Array<OutputTextContentParam | RefusalContentParam>;
  status?: string;
};

/**
 * A function call item.
 */
export type FunctionCallItemParam = {
  id?: string;
  call_id: string;
  type: 'function_call';
  name: string;
  arguments: string;
  status?: FunctionCallStatus;
};

/**
 * A function call output item.
 */
export type FunctionCallOutputItemParam = {
  id?: string;
  call_id: string;
  type: 'function_call_output';
  output:
  | string
  | Array<
    | InputTextContentParam
    | InputImageContentParam
    | InputFileContentParam
    | InputVideoContent
  >;
  status?: FunctionCallStatus;
};

// ============================================================================
// Tool Types
// ============================================================================

/**
 * A function tool parameter.
 */
export type FunctionToolParam = {
  name: string;
  description?: string;
  parameters?: JSONSchema7;
  strict?: boolean;
  type: 'function';
};

/**
 * A specific function tool choice.
 */
export type SpecificFunctionParam = {
  type: 'function';
  name: string;
};

/**
 * Allowed tools parameter.
 */
export type AllowedToolsParam = {
  type: 'allowed_tools';
  tools: SpecificFunctionParam[];
  mode?: ToolChoiceValueEnum;
};

/**
 * Controls which tool the model should use, if any.
 */
export type ToolChoiceParam =
  | ToolChoiceValueEnum
  | SpecificFunctionParam
  | AllowedToolsParam;

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Set of 16 key-value pairs that can be attached to an object.
 */
export type MetadataParam = Record<string, string>;

/**
 * Text response format (plain text).
 */
export type TextResponseFormat = {
  type: 'text';
};

/**
 * JSON schema response format.
 */
export type JsonSchemaResponseFormatParam = {
  type: 'json_schema';
  description?: string;
  name?: string;
  schema?: JSONSchema7;
  strict?: boolean;
};

/**
 * Configuration options for text output.
 */
export type TextParam = {
  format?: TextResponseFormat | JsonSchemaResponseFormatParam;
  verbosity?: VerbosityEnum;
};

/**
 * Options that control streamed response behavior.
 */
export type StreamOptionsParam = {
  include_obfuscation?: boolean;
};

/**
 * Configuration options for reasoning behavior.
 */
export type ReasoningParam = {
  effort?: ReasoningEffortEnum;
  summary?: ReasoningSummaryEnum;
};

// ============================================================================
// Request Body
// ============================================================================

/**
 * Body that is sent to the Open Responses API.
 */
export type OpenResponsesApiRequestBody = {
  /**
   * The model to use for this request, e.g. 'gpt-5.2'.
   */
  model: string;

  /**
   * Context for the model: either a string (interpreted as a user message),
   * or an array of structured message items.
   */
  input:
  | string
  | Array<
    | ItemReferenceParam
    | ReasoningItemParam
    | UserMessageItemParam
    | SystemMessageItemParam
    | DeveloperMessageItemParam
    | AssistantMessageItemParam
    | FunctionCallItemParam
    | FunctionCallOutputItemParam
  >;

  /**
   * The ID of the response to use as the prior turn for this request.
   */
  previous_response_id?: string;

  /**
   * Options specifying extra values to include in the response.
   */
  include?: Array<
    'reasoning.encrypted_content' | 'message.output_text.logprobs'
  >;

  /**
   * A list of tools that the model may call while generating the response.
   */
  tools?: FunctionToolParam[];

  /**
   * Controls which tool the model should use, if any.
   */
  tool_choice?: ToolChoiceParam;

  /**
   * Structured metadata as up to 16 key-value pairs.
   */
  metadata?: MetadataParam;

  /**
   * Configuration options for text output.
   */
  text?: TextParam;

  /**
   * Sampling temperature to use, between 0 and 2.
   */
  temperature?: number;

  /**
   * Nucleus sampling parameter, between 0 and 1.
   */
  top_p?: number;

  /**
   * Penalizes new tokens based on whether they appear in the text so far.
   */
  presence_penalty?: number;

  /**
   * Penalizes new tokens based on their frequency in the text so far.
   */
  frequency_penalty?: number;

  /**
   * Whether the model may call multiple tools in parallel.
   */
  parallel_tool_calls?: boolean;

  /**
   * Whether to stream response events as server-sent events.
   */
  stream?: boolean;

  /**
   * Options that control streamed response behavior.
   */
  stream_options?: StreamOptionsParam;

  /**
   * Whether to run the request in the background and return immediately.
   */
  background?: boolean;

  /**
   * Maximum number of tokens the model may generate.
   */
  max_output_tokens?: number;

  /**
   * Maximum number of tool calls the model may make while generating the response.
   */
  max_tool_calls?: number;

  /**
   * Configuration options for reasoning behavior.
   */
  reasoning?: ReasoningParam;

  /**
   * A stable identifier used for safety monitoring and abuse detection.
   */
  safety_identifier?: string;

  /**
   * A key to use when reading/writing to the prompt cache.
   */
  prompt_cache_key?: string;

  /**
   * Controls how input is truncated if it exceeds the model's context window.
   * - 'auto': Let the service decide how to truncate.
   * - 'disabled': Disable truncation. Context overflow yields 400 error.
   */
  truncation?: 'auto' | 'disabled';

  /**
   * Additional instructions to guide the model for this request.
   */
  instructions?: string;

  /**
   * Whether to store the response so it can be retrieved later.
   */
  store?: boolean;

  /**
   * The service tier to use for this request.
   * - 'auto' | 'default' | 'flex' | 'priority'
   */
  service_tier?: 'auto' | 'default' | 'flex' | 'priority';

  /**
   * Number of most likely tokens to return at each position, with logprobs.
   */
  top_logprobs?: number;
};
