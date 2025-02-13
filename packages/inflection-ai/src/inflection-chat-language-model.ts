import {
  LanguageModelV1,
  LanguageModelV1CallWarning,
  LanguageModelV1FinishReason,
  LanguageModelV1StreamPart,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  ParseResult,
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonResponseHandler,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { convertToInflectionChatMessages } from './convert-to-inflection-chat-messages';
import {
  InflectionChatModelId,
  InflectionChatSettings,
} from './inflection-chat-settings';
import { inflectionFailedResponseHandler } from './inflection-error';
import { getResponseMetadata } from './get-response-metadata';

type InflectionChatConfig = {
  provider: string;
  baseURL: string;
  headers: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
};

export class InflectionChatLanguageModel implements LanguageModelV1 {
  readonly specificationVersion = 'v1';
  readonly defaultObjectGenerationMode = 'json';
  readonly supportsImageUrls = false;

  readonly modelId: InflectionChatModelId;
  readonly settings: InflectionChatSettings;

  private readonly config: InflectionChatConfig;

  constructor(
    modelId: InflectionChatModelId,
    settings: InflectionChatSettings,
    config: InflectionChatConfig,
  ) {
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
  }

  get provider(): string {
    return this.config.provider;
  }

  private getArgs({
    mode,
    prompt,
    maxTokens,
    temperature,
    topP,
    stopSequences,
    seed,
  }: Parameters<LanguageModelV1['doGenerate']>[0]) {
    const type = mode.type;
    const warnings: LanguageModelV1CallWarning[] = [];

    // Throw error if trying to use tool-related modes
    if (type === 'object-tool' || (type === 'regular' && mode.tools?.length)) {
      throw new UnsupportedFunctionalityError({
        functionality: 'Tool calls are not supported by Inflection AI',
      });
    }

    const baseArgs = {
      // config instead of model:
      config: this.modelId,

      // standardized settings:
      max_tokens: maxTokens,
      temperature,
      top_p: topP,
      stop_tokens: stopSequences,
      web_search: this.settings.web_search,

      // metadata if provided:
      metadata: this.settings.metadata,

      // context (messages):
      context: convertToInflectionChatMessages(prompt),
    };

    return { args: baseArgs, warnings };
  }

  async doGenerate(
    options: Parameters<LanguageModelV1['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV1['doGenerate']>>> {
    const { args, warnings } = this.getArgs(options);

    const { responseHeaders, value: response } = await postJsonToApi({
      url: this.config.baseURL,
      headers: combineHeaders(this.config.headers(), options.headers),
      body: args,
      failedResponseHandler: inflectionFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        inflectionChatResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const { context: rawPrompt, ...rawSettings } = args;

    // Estimate token counts since API doesn't provide them
    const promptText = rawPrompt.map(m => m.text).join('');
    const promptTokens = Math.ceil(promptText.length / 4);
    const completionTokens = Math.ceil(response.text.length / 4);

    return {
      text: response.text,
      finishReason: 'stop',
      usage: {
        promptTokens,
        completionTokens,
      },
      rawCall: { rawPrompt, rawSettings },
      rawResponse: { headers: responseHeaders },
      request: { body: JSON.stringify(args) },
      response: getResponseMetadata(response),
      warnings,
    };
  }

  async doStream(
    options: Parameters<LanguageModelV1['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV1['doStream']>>> {
    const { args, warnings } = this.getArgs(options);

    const body = { ...args, stream: true };

    const { responseHeaders, value: response } = await postJsonToApi({
      url: `${this.config.baseURL}/streaming`,
      headers: combineHeaders(this.config.headers(), options.headers),
      body,
      failedResponseHandler: inflectionFailedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(
        inflectionChatChunkSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const { context: rawPrompt, ...rawSettings } = args;

    let finishReason: LanguageModelV1FinishReason = 'stop';
    const promptText = rawPrompt.map(m => m.text).join('');
    const promptTokens = Math.ceil(promptText.length / 4);
    let completionTokens = 0;

    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<z.infer<typeof inflectionChatChunkSchema>>,
          LanguageModelV1StreamPart
        >({
          transform(chunk, controller) {
            if (!chunk.success) {
              controller.enqueue({ type: 'error', error: chunk.error });
              return;
            }

            const value = chunk.value;
            completionTokens += Math.ceil(value.text.length / 4);

            if (chunk.value.idx === 0) {
              controller.enqueue({
                type: 'response-metadata',
                timestamp: new Date(value.created * 1000),
              });
            }

            controller.enqueue({
              type: 'text-delta',
              textDelta: value.text,
            });
          },

          flush(controller) {
            controller.enqueue({
              type: 'finish',
              finishReason,
              usage: {
                promptTokens,
                completionTokens,
              },
            });
          },
        }),
      ),
      rawCall: { rawPrompt, rawSettings },
      rawResponse: { headers: responseHeaders },
      request: { body: JSON.stringify(body) },
      warnings,
    };
  }
}

// limited version of the schema, focussed on what is needed for the implementation
const inflectionChatResponseSchema = z.object({
  created: z.number(),
  text: z.string(),
});

// limited version of the schema, focussed on what is needed for the implementation
const inflectionChatChunkSchema = z.object({
  created: z.number(),
  idx: z.number(),
  text: z.string(),
});
