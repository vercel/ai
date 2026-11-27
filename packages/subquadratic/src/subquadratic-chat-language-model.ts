import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  SharedV4Warning,
} from '@ai-sdk/provider';
import {
  mapReasoningToProviderEffort,
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import type { SubquadraticChatModelId } from './subquadratic-chat-language-model-options';
import type { SubquadraticConfig } from './subquadratic-config';
import { subquadraticRequestDefaults } from './subquadratic-model-catalog';

/**
 * SubQ chat completions over the OpenAI-compatible protocol. The model keeps
 * its serializable settings and rebuilds the OpenAI-compatible model from them,
 * so the URL and request adapters survive workflow serialization.
 */
export class SubquadraticChatLanguageModel implements LanguageModelV4 {
  readonly specificationVersion = 'v4';
  private readonly chat: OpenAICompatibleChatLanguageModel;

  static [WORKFLOW_SERIALIZE](model: SubquadraticChatLanguageModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: SubquadraticChatModelId;
    config: SubquadraticConfig;
  }) {
    return new SubquadraticChatLanguageModel(options.modelId, options.config);
  }

  constructor(
    readonly modelId: SubquadraticChatModelId,
    private readonly config: SubquadraticConfig,
  ) {
    this.chat = new OpenAICompatibleChatLanguageModel(modelId, {
      provider: config.provider,
      url: ({ path }) => `${config.baseURL}${path}`,
      headers: config.headers,
      fetch: config.fetch,
      // Or stream_options.include_usage is omitted and streams report no usage.
      includeUsage: true,
      supportsStructuredOutputs:
        subquadraticRequestDefaults.language.supportsStructuredOutputs,
      mapReasoning: ({ reasoning, warnings }) =>
        mapReasoningToProviderEffort({
          reasoning,
          effortMap: subquadraticRequestDefaults.language.reasoningEffortMap,
          warnings,
        }),
      transformRequestBody: transformSubquadraticRequestBody,
    });
  }

  get provider() {
    return this.config.provider;
  }

  get supportedUrls() {
    return this.chat.supportedUrls;
  }

  doGenerate(options: LanguageModelV4CallOptions) {
    return this.chat.doGenerate(options);
  }

  doStream(options: LanguageModelV4CallOptions) {
    return this.chat.doStream(options);
  }
}

/**
 * Adapts the OpenAI-compatible request body to what the Chat Completions API
 * accepts. SubQ rejects any `temperature` other than 1, and forced tool choice
 * returns tool calls as text instead of `tool_calls`.
 */
function transformSubquadraticRequestBody(
  args: Record<string, any>,
  warnings?: SharedV4Warning[],
): Record<string, any> {
  const { temperature, tool_choice: toolChoice, tools, ...rest } = args;

  if (temperature != null && temperature !== 1) {
    warnings?.push({
      type: 'unsupported',
      feature: 'temperature',
      details: 'SubQ only supports a temperature of 1. temperature is omitted.',
    });
  }

  if (toolChoice === 'required') {
    warnings?.push({
      type: 'unsupported',
      feature: 'toolChoice',
      details:
        `toolChoice 'required' is not supported by this model because it does not return forced tool calls as tool calls. ` +
        `Using 'auto' instead. Instruct the model to use a tool in the prompt and verify that a tool call was made.`,
    });
  }

  const toolName: string | undefined =
    typeof toolChoice === 'object' ? toolChoice?.function?.name : undefined;
  if (toolName != null) {
    warnings?.push({
      type: 'unsupported',
      feature: 'toolChoice',
      details:
        `toolChoice 'tool' is not supported by this model because it does not return forced tool calls as tool calls. ` +
        `Only the '${toolName}' tool is sent with 'auto' tool choice. ` +
        `Instruct the model to use the tool in the prompt and verify that a tool call was made.`,
    });
  }

  return {
    ...rest,
    ...(temperature === 1 && { temperature }),
    tools:
      toolName != null
        ? tools?.filter(
            (tool: { function?: { name?: string } }) =>
              tool.function?.name === toolName,
          )
        : tools,
    tool_choice:
      toolChoice === 'required' || toolName != null ? 'auto' : toolChoice,
  };
}
