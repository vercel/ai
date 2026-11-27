import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import {
  NoSuchModelError,
  type Experimental_DecisionModelV4 as DecisionModelV4,
  type LanguageModelV4,
  type ProviderV4,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  loadApiKey,
  mapReasoningToProviderEffort,
  resolveWith,
  withoutTrailingSlash,
  withUserAgentSuffix,
  type FetchFunction,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import type { SubquadraticChatModelId } from './subquadratic-chat-options';
import { DecisionSubquadraticModel } from './subquadratic-decision-model';
import type { SubquadraticDecisionModelId } from './subquadratic-decision-model-options';
import { subquadraticRequestDefaults } from './subquadratic-model-catalog';
import { VERSION } from './version';

export interface SubquadraticProviderSettings {
  /**
   * SubQ API key. Default value is taken from the `SUBQUADRATIC_API_KEY`
   * environment variable.
   * A function is called before each request and may return a promise.
   */
  apiKey?: Resolvable<string>;

  /**
   * Base URL for the API calls. Default: 'https://api.subq.ai/v1'
   */
  baseURL?: string;

  /**
   * Custom headers to include in the requests.
   */
  headers?: Record<string, string>;

  /**
   * Custom fetch implementation. You can use it as a middleware to intercept requests,
   * or to provide a custom fetch implementation for e.g. testing.
   */
  fetch?: FetchFunction;
}

export interface SubquadraticProvider extends ProviderV4 {
  /**
   * Creates a chat model for text generation.
   */
  (modelId: SubquadraticChatModelId): LanguageModelV4;

  /**
   * Creates a chat model for text generation.
   */
  chatModel(modelId: SubquadraticChatModelId): LanguageModelV4;

  /**
   * Creates a language model for text generation. Alias for chatModel.
   */
  languageModel(modelId: SubquadraticChatModelId): LanguageModelV4;

  /**
   * Creates an experimental decision model using the SubQ Decisions API.
   */
  decisionModel(modelId: SubquadraticDecisionModelId): DecisionModelV4;
}

const defaultBaseURL = 'https://api.subq.ai/v1';

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

export function createSubquadratic(
  options: SubquadraticProviderSettings = {},
): SubquadraticProvider {
  const baseURL =
    withoutTrailingSlash(options.baseURL ?? defaultBaseURL) ?? defaultBaseURL;
  const getHeaders = () =>
    resolveWith(options.apiKey, apiKey =>
      withUserAgentSuffix(
        {
          Authorization: `Bearer ${loadApiKey({
            apiKey,
            environmentVariableName: 'SUBQUADRATIC_API_KEY',
            description: 'SubQ API key',
          })}`,
          ...options.headers,
        },
        `ai-sdk-subquadratic/${VERSION}`,
      ),
    );

  const createChatModel = (modelId: SubquadraticChatModelId) =>
    new OpenAICompatibleChatLanguageModel(modelId, {
      provider: 'subquadratic.chat',
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
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

  const provider = (modelId: SubquadraticChatModelId) =>
    createChatModel(modelId);

  provider.specificationVersion = 'v4' as const;
  provider.chatModel = createChatModel;
  provider.languageModel = createChatModel;
  provider.decisionModel = (modelId: SubquadraticDecisionModelId) =>
    new DecisionSubquadraticModel(modelId, {
      provider: 'subquadratic.decision',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });
  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };
  provider.embeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
  };
  return provider;
}

export const subquadratic = createSubquadratic();
