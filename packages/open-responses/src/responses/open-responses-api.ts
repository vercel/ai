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
// Response-Specific Types
// ============================================================================

/**
 * The status of a message item in the response.
 */
export type MessageStatus = 'in_progress' | 'completed' | 'incomplete';

/**
 * Truncation enum for responses.
 */
export type TruncationEnum = 'auto' | 'disabled';

/**
 * Service tier enum.
 */
export type ServiceTierEnum = 'auto' | 'default' | 'flex' | 'priority';

/**
 * A top log probability of a token.
 */
export type TopLogProb = {
  token: string;
  logprob: number;
  bytes: number[];
};

/**
 * The log probability of a token.
 */
export type LogProb = {
  token: string;
  logprob: number;
  bytes: number[];
  top_logprobs: TopLogProb[];
};

/**
 * A URL citation annotation in a response.
 */
export type UrlCitationBody = {
  type: 'url_citation';
  url: string;
  start_index: number;
  end_index: number;
  title: string;
};

/**
 * An annotation that applies to a span of output text.
 */
export type Annotation = UrlCitationBody;

/**
 * A text input content in a response.
 */
export type InputTextContent = {
  type: 'input_text';
  text: string;
};

/**
 * A text output from the model in a response.
 */
export type OutputTextContent = {
  type: 'output_text';
  text: string;
  annotations: Annotation[];
  logprobs: LogProb[];
};

/**
 * A refusal from the model in a response.
 */
export type RefusalContent = {
  type: 'refusal';
  refusal: string;
};

/**
 * Reasoning text from the model.
 */
export type ReasoningTextContent = {
  type: 'reasoning_text';
  text: string;
};

/**
 * A summary text from the model.
 */
export type SummaryTextContent = {
  type: 'summary_text';
  text: string;
};

/**
 * An image input content in a response.
 */
export type InputImageContent = {
  type: 'input_image';
  image_url?: string;
  detail: ImageDetail;
};

/**
 * A file input content in a response.
 */
export type InputFileContent = {
  type: 'input_file';
  filename?: string;
  file_url?: string;
};

/**
 * A message in the response.
 */
export type Message = {
  type: 'message';
  id: string;
  status: MessageStatus;
  role: 'user' | 'assistant' | 'system' | 'developer';
  content: InputTextContent[];
};

/**
 * A function tool call that was generated by the model.
 */
export type FunctionCall = {
  type: 'function_call';
  id: string;
  call_id: string;
  name: string;
  arguments: string;
  status: FunctionCallStatus;
};

/**
 * A function tool call output that was returned.
 */
export type FunctionCallOutput = {
  type: 'function_call_output';
  id: string;
  call_id: string;
  output:
    | string
    | Array<InputTextContent | InputImageContent | InputFileContent>;
  status: FunctionCallStatus;
};

/**
 * A reasoning item that was generated by the model.
 */
export type ReasoningBody = {
  type: 'reasoning';
  id: string;
  content?: InputTextContent[];
  summary: InputTextContent[];
  encrypted_content?: string;
};

/**
 * Output item field union type.
 */
export type OutputItem =
  | FunctionCall
  | FunctionCallOutput
  | Message
  | ReasoningBody;

/**
 * Details about why the response was incomplete.
 */
export type IncompleteDetails = {
  reason: string;
};

/**
 * An error that occurred while generating the response.
 */
export type ResponseError = {
  code: string;
  message: string;
};

/**
 * A function tool in a response.
 */
export type FunctionTool = {
  type: 'function';
  name: string;
  description?: string;
  parameters?: JSONSchema7;
  strict?: boolean;
};

/**
 * Function tool choice in a response.
 */
export type FunctionToolChoice = {
  type: 'function';
  name?: string;
};

/**
 * Allowed tool choice in a response.
 */
export type AllowedToolChoice = {
  type: 'allowed_tools';
  tools: FunctionToolChoice[];
  mode: ToolChoiceValueEnum;
};

/**
 * Tool choice in a response.
 */
export type ResponseToolChoice =
  | ToolChoiceValueEnum
  | FunctionToolChoice
  | AllowedToolChoice;

/**
 * JSON object response format.
 */
export type JsonObjectResponseFormat = {
  type: 'json_object';
};

/**
 * JSON schema response format in a response.
 */
export type JsonSchemaResponseFormat = {
  type: 'json_schema';
  name: string;
  description?: string;
  schema: unknown;
  strict: boolean;
};

/**
 * Text field in a response.
 */
export type TextField = {
  format?:
    | TextResponseFormat
    | JsonObjectResponseFormat
    | JsonSchemaResponseFormat;
  verbosity?: VerbosityEnum;
};

/**
 * A breakdown of input token usage that was recorded.
 */
export type InputTokensDetails = {
  cached_tokens: number;
};

/**
 * A breakdown of output token usage that was recorded.
 */
export type OutputTokensDetails = {
  reasoning_tokens: number;
};

/**
 * Token usage statistics that were recorded for the response.
 */
export type Usage = {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  input_tokens_details: InputTokensDetails;
  output_tokens_details: OutputTokensDetails;
};

/**
 * Reasoning configuration and outputs that were produced for this response.
 */
export type Reasoning = {
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

// ============================================================================
// Response Body
// ============================================================================

/**
 * Response body from the Open Responses API.
 */
export type OpenResponsesApiResponseBody = {
  /**
   * The unique ID of the response that was created.
   */
  id: string;

  /**
   * The object type, which is always 'response'.
   */
  object: 'response';

  /**
   * The Unix timestamp (in seconds) for when the response was created.
   */
  created_at: number;

  /**
   * The Unix timestamp (in seconds) for when the response was completed, if it was completed.
   */
  completed_at?: number;

  /**
   * The status that was set for the response.
   */
  status: string;

  /**
   * Details about why the response was incomplete, if applicable.
   */
  incomplete_details?: IncompleteDetails;

  /**
   * The model that generated this response.
   */
  model: string;

  /**
   * The ID of the previous response in the chain that was referenced, if any.
   */
  previous_response_id?: string;

  /**
   * Additional instructions that were used to guide the model for this response.
   */
  instructions?: string;

  /**
   * The output items that were generated by the model.
   */
  output: OutputItem[];

  /**
   * The error that occurred, if the response failed.
   */
  error?: ResponseError;

  /**
   * The tools that were available to the model during response generation.
   */
  tools?: FunctionTool[];

  /**
   * The tool choice configuration that was used.
   */
  tool_choice?: ResponseToolChoice;

  /**
   * How the input was truncated by the service when it exceeded the model context window.
   */
  truncation?: TruncationEnum;

  /**
   * Whether the model was allowed to call multiple tools in parallel.
   */
  parallel_tool_calls?: boolean;

  /**
   * Configuration options for text output that were used.
   */
  text?: TextField;

  /**
   * The nucleus sampling parameter that was used for this response.
   */
  top_p?: number;

  /**
   * The presence penalty that was used.
   */
  presence_penalty?: number;

  /**
   * The frequency penalty that was used.
   */
  frequency_penalty?: number;

  /**
   * The number of most likely tokens that were returned at each position.
   */
  top_logprobs?: number;

  /**
   * The sampling temperature that was used for this response.
   */
  temperature?: number;

  /**
   * Reasoning configuration and outputs that were produced for this response.
   */
  reasoning?: Reasoning;

  /**
   * Token usage statistics that were recorded for the response, if available.
   */
  usage?: Usage;

  /**
   * The maximum number of tokens the model was allowed to generate for this response.
   */
  max_output_tokens?: number;

  /**
   * The maximum number of tool calls the model was allowed to make.
   */
  max_tool_calls?: number;

  /**
   * Whether this response was stored so it can be retrieved later.
   */
  store?: boolean;

  /**
   * Whether this request was run in the background.
   */
  background?: boolean;

  /**
   * The service tier that was used for this response.
   */
  service_tier?: string;

  /**
   * Developer-defined metadata that was associated with the response.
   */
  metadata?: unknown;

  /**
   * A stable identifier that was used for safety monitoring and abuse detection.
   */
  safety_identifier?: string;

  /**
   * A key that was used to read from or write to the prompt cache.
   */
  prompt_cache_key?: string;
};
