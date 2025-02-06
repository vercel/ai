import {
  LanguageModelV1,
  LanguageModelV1CallWarning,
  LanguageModelV1FinishReason,
  LanguageModelV1LogProbs,
  LanguageModelV1Source,
} from '@ai-sdk/provider';

// Re-export LanguageModelV1 types for the middleware:
export type {
  LanguageModelV1,
  LanguageModelV1CallOptions,
  LanguageModelV1CallWarning,
  LanguageModelV1FilePart,
  LanguageModelV1FinishReason,
  LanguageModelV1FunctionToolCall,
  LanguageModelV1ImagePart,
  LanguageModelV1Message,
  LanguageModelV1ObjectGenerationMode,
  LanguageModelV1Prompt,
  LanguageModelV1ProviderDefinedTool,
  LanguageModelV1ProviderMetadata,
  LanguageModelV1StreamPart,
  LanguageModelV1TextPart,
  LanguageModelV1ToolCallPart,
  LanguageModelV1ToolChoice,
  LanguageModelV1ToolResultPart,
} from '@ai-sdk/provider';

/**
Language model that is used by the AI SDK Core functions.
*/
export type LanguageModel = LanguageModelV1;

/**
Reason why a language model finished generating a response.

Can be one of the following:
- `stop`: model generated stop sequence
- `length`: model generated maximum number of tokens
- `content-filter`: content filter violation stopped the model
- `tool-calls`: model triggered tool calls
- `error`: model stopped because of an error
- `other`: model stopped for other reasons
*/
export type FinishReason = LanguageModelV1FinishReason;

/**
Log probabilities for each token and its top log probabilities.

@deprecated Will become a provider extension in the future.
 */
export type LogProbs = LanguageModelV1LogProbs;

/**
Warning from the model provider for this call. The call will proceed, but e.g.
some settings might not be supported, which can lead to suboptimal results.
*/
export type CallWarning = LanguageModelV1CallWarning;

/**
A source that has been used as input to generate the response.
*/
export type Source = LanguageModelV1Source;

/**
Tool choice for the generation. It supports the following settings:

- `auto` (default): the model can choose whether and which tools to call.
- `required`: the model must call a tool. It can choose which tool to call.
- `none`: the model must not call tools
- `{ type: 'tool', toolName: string (typed) }`: the model must call the specified tool
 */
export type ToolChoice<TOOLS extends Record<string, unknown>> =
  | 'auto'
  | 'none'
  | 'required'
  | { type: 'tool'; toolName: keyof TOOLS };

/**
 * @deprecated Use `ToolChoice` instead.
 */
// TODO remove in v5
export type CoreToolChoice<TOOLS extends Record<string, unknown>> =
  ToolChoice<TOOLS>;
