import {
  LanguageModelV3,
  SharedV3Warning,
  LanguageModelV3FinishReason,
  LanguageModelV3StreamPart,
  LanguageModelV3Usage,
  SharedV3ProviderMetadata,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  ParseResult,
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonResponseHandler,
  parseProviderOptions,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { openaiFailedResponseHandler } from '../openai-error';
import { convertToOpenAICompletionPrompt } from './convert-to-openai-completion-prompt';
import { getResponseMetadata } from './get-response-metadata';
import { mapOpenAIFinishReason } from './map-openai-finish-reason';
import {
  OpenAICompletionChunk,
  openaiCompletionChunkSchema,
  openaiCompletionResponseSchema,
} from './openai-completion-api';
import {
  OpenAICompletionModelId,
  openaiCompletionProviderOptions,
} from './openai-completion-options';

type OpenAICompletionConfig = {
  provider: string;
  headers: () => Record<string, string | undefined>;
  url: (options: { modelId: string; path: string }) => string;
  fetch?: FetchFunction;
};

export class OpenAICompletionLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = 'v3';

  readonly modelId: OpenAICompletionModelId;

  private readonly config: OpenAICompletionConfig;

  private get providerOptionsName(): string {
    return this.config.provider.split('.')[0].trim();
  }

  constructor(
    modelId: OpenAICompletionModelId,
    config: OpenAICompletionConfig,
  ) {
    this.modelId = modelId;
    this.config = config;
  }

  get provider(): string {
    return this.config.provider;
  }

  readonly supportedUrls: Record<string, RegExp[]> = {
    // No URLs are supported for completion models.
  };

  private async getArgs({
    prompt,
    maxOutputTokens,
    temperature,
    topP,
    topK,
    frequencyPenalty,
    presencePenalty,
    stopSequences: userStopSequences,
    responseFormat,
    tools,
    toolChoice,
    seed,
    providerOptions,
  }: Parameters<LanguageModelV3['doGenerate']>[0]) {
    const warnings: SharedV3Warning[] = [];

    // Parse provider options
    const openaiOptions = {
      ...(await parseProviderOptions({
        provider: 'openai',
        providerOptions,
        schema: openaiCompletionProviderOptions,
      })),
      ...(await parseProviderOptions({
        provider: this.providerOptionsName,
        providerOptions,
        schema: openaiCompletionProviderOptions,
      })),
    };

    if (topK != null) {
      warnings.push({ type: 'unsupported', feature: 'topK' });
    }

    if (tools?.length) {
      warnings.push({ type: 'unsupported', feature: 'tools' });
    }

    if (toolChoice != null) {
      warnings.push({ type: 'unsupported', feature: 'toolChoice' });
    }

    if (responseFormat != null && responseFormat.type !== 'text') {
      warnings.push({
        type: 'unsupported',
        feature: 'responseFormat',
        details: 'JSON response format is not supported.',
      });
    }

    const { prompt: completionPrompt, stopSequences } =
      convertToOpenAICompletionPrompt({ prompt });

    const stop = [...(stopSequences ?? []), ...(userStopSequences ?? [])];

    return {
      args: {
        // model id:
        model: this.modelId,

        // model specific settings:
        echo: openaiOptions.echo,
        logit_bias: openaiOptions.logitBias,
        logprobs:
          openaiOptions?.logprobs === true
            ? 0
            : openaiOptions?.logprobs === false
              ? undefined
              : openaiOptions?.logprobs,
        suffix: openaiOptions.suffix,
        user: openaiOptions.user,

        // standardized settings:
        max_tokens: maxOutputTokens,
        temperature,
        top_p: topP,
        frequency_penalty: frequencyPenalty,
        presence_penalty: presencePenalty,
        seed,

        // prompt:
        prompt: completionPrompt,

        // stop sequences:
        stop: stop.length > 0 ? stop : undefined,
      },
      warnings,
    };
  }

  async doGenerate(
    options: Parameters<LanguageModelV3['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV3['doGenerate']>>> {
    const { args, warnings } = await this.getArgs(options);

    const {
      responseHeaders,
      value: response,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url: this.config.url({
        path: '/completions',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: args,
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        openaiCompletionResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const choice = response.choices[0];

    const providerMetadata: SharedV3ProviderMetadata = { openai: {} };

    if (choice.logprobs != null) {
      providerMetadata.openai.logprobs = choice.logprobs;
    }

    return {
      content: [{ type: 'text', text: choice.text }],
      usage: {
        inputTokens: response.usage?.prompt_tokens,
        outputTokens: response.usage?.completion_tokens,
        totalTokens: response.usage?.total_tokens,
      },
      finishReason: mapOpenAIFinishReason(choice.finish_reason),
      request: { body: args },
      response: {
        ...getResponseMetadata(response),
        headers: responseHeaders,
        body: rawResponse,
      },
      providerMetadata,
      warnings,
    };
  }

  async doStream(
    options: Parameters<LanguageModelV3['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV3['doStream']>>> {
    const { args, warnings } = await this.getArgs(options);

    const body = {
      ...args,
      stream: true,

      stream_options: {
        include_usage: true,
      },
    };

    const { responseHeaders, value: response } = await postJsonToApi({
      url: this.config.url({
        path: '/completions',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body,
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(
        openaiCompletionChunkSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    let finishReason: LanguageModelV3FinishReason = 'unknown';
    const providerMetadata: SharedV3ProviderMetadata = { openai: {} };
    const usage: LanguageModelV3Usage = {
      inputTokens: undefined,
      outputTokens: undefined,
      totalTokens: undefined,
    };
    let isFirstChunk = true;

    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<OpenAICompletionChunk>,
          LanguageModelV3StreamPart
        >({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings });
          },

          transform(chunk, controller) {
            if (options.includeRawChunks) {
              controller.enqueue({ type: 'raw', rawValue: chunk.rawValue });
            }

            // handle failed chunk parsing / validation:
            if (!chunk.success) {
              finishReason = 'error';
              controller.enqueue({ type: 'error', error: chunk.error });
              return;
            }

            const value = chunk.value;

            // handle error chunks:
            if ('error' in value) {
              finishReason = 'error';
              controller.enqueue({ type: 'error', error: value.error });
              return;
            }

            if (isFirstChunk) {
              isFirstChunk = false;

              controller.enqueue({
                type: 'response-metadata',
                ...getResponseMetadata(value),
              });

              controller.enqueue({ type: 'text-start', id: '0' });
            }

            if (value.usage != null) {
              usage.inputTokens = value.usage.prompt_tokens;
              usage.outputTokens = value.usage.completion_tokens;
              usage.totalTokens = value.usage.total_tokens;
            }

            const choice = value.choices[0];

            if (choice?.finish_reason != null) {
              finishReason = mapOpenAIFinishReason(choice.finish_reason);
            }

            if (choice?.logprobs != null) {
              providerMetadata.openai.logprobs = choice.logprobs;
            }

            if (choice?.text != null && choice.text.length > 0) {
              controller.enqueue({
                type: 'text-delta',
                id: '0',
                delta: choice.text,
              });
            }
          },

          flush(controller) {
            if (!isFirstChunk) {
              controller.enqueue({ type: 'text-end', id: '0' });
            }

            controller.enqueue({
              type: 'finish',
              finishReason,
              providerMetadata,
              usage,
            });
          },
        }),
      ),
      request: { body },
      response: { headers: responseHeaders },
    };
  }
}
