import {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3Content,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
  LanguageModelV3Usage,
  SharedV3Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  jsonSchema,
  ParseResult,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { convertToOpenResponsesInput } from './convert-to-open-responses-input';
import {
  FunctionToolParam,
  OpenResponsesRequestBody,
  OpenResponsesResponseBody,
  OpenResponsesChunk,
  openResponsesErrorSchema,
} from './open-responses-api';
import { OpenResponsesConfig } from './open-responses-config';

export class OpenResponsesLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = 'v3';

  readonly modelId: string;

  private readonly config: OpenResponsesConfig;

  constructor(modelId: string, config: OpenResponsesConfig) {
    this.modelId = modelId;
    this.config = config;
  }

  readonly supportedUrls: Record<string, RegExp[]> = {};

  get provider(): string {
    return this.config.provider;
  }

  private async getArgs({
    maxOutputTokens,
    temperature,
    stopSequences,
    topP,
    topK,
    presencePenalty,
    frequencyPenalty,
    seed,
    prompt,
    providerOptions,
    tools,
    toolChoice,
    responseFormat,
  }: LanguageModelV3CallOptions): Promise<{
    body: Omit<OpenResponsesRequestBody, 'stream' | 'stream_options'>;
    warnings: SharedV3Warning[];
  }> {
    const { input, warnings: inputWarnings } =
      await convertToOpenResponsesInput({
        prompt,
      });

    // Convert function tools to the Open Responses format
    const functionTools: FunctionToolParam[] | undefined =
      tools
        ?.filter(tool => tool.type === 'function')
        .map(tool => ({
          type: 'function' as const,
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
          ...(tool.strict != null ? { strict: tool.strict } : {}),
        }));

    return {
      body: {
        model: this.modelId,
        input,
        max_output_tokens: maxOutputTokens,
        temperature,
        tools: functionTools?.length ? functionTools : undefined,
      },
      warnings: inputWarnings,
    };
  }

  async doGenerate(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3GenerateResult> {
    const { body, warnings } = await this.getArgs(options);

    const {
      responseHeaders,
      value: response,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url: this.config.url,
      headers: combineHeaders(this.config.headers(), options.headers),
      body,
      failedResponseHandler: createJsonErrorResponseHandler({
        errorSchema: openResponsesErrorSchema,
        errorToMessage: error => error.error.message,
      }),
      successfulResponseHandler: createJsonResponseHandler(
        // do not validate the response body, only apply types to the response body
        jsonSchema<OpenResponsesResponseBody>(() => {
          throw new Error('json schema not implemented');
        }),
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const content: Array<LanguageModelV3Content> = [];

    for (const part of response.output!) {
      switch (part.type) {
        // TODO AI SDK 7 adjust reasoning in the specification to better support the reasoning structure from open responses.
        case 'reasoning': {
          for (const contentPart of part.content ?? []) {
            content.push({
              type: 'reasoning',
              text: contentPart.text,
            });
          }
          break;
        }

        case 'message': {
          for (const contentPart of part.content) {
            content.push({
              type: 'text',
              text: contentPart.text,
            });
          }

          break;
        }
      }
    }

    const usage = response.usage;
    const inputTokens = usage?.input_tokens;
    const cachedInputTokens = usage?.input_tokens_details?.cached_tokens;
    const outputTokens = usage?.output_tokens;
    const reasoningTokens = usage?.output_tokens_details?.reasoning_tokens;

    return {
      content,
      finishReason: {
        unified: 'stop',
        raw: undefined,
      },
      usage: {
        inputTokens: {
          total: inputTokens,
          noCache: (inputTokens ?? 0) - (cachedInputTokens ?? 0),
          cacheRead: cachedInputTokens,
          cacheWrite: undefined,
        },
        outputTokens: {
          total: outputTokens,
          text: (outputTokens ?? 0) - (reasoningTokens ?? 0),
          reasoning: reasoningTokens,
        },
        raw: response.usage,
      },
      request: { body },
      response: {
        id: response.id,
        timestamp: new Date(response.created_at! * 1000),
        modelId: response.model,
        headers: responseHeaders,
        body: rawResponse,
      },
      providerMetadata: undefined,
      warnings,
    };
  }

  async doStream(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3StreamResult> {
    const { body, warnings } = await this.getArgs(options);

    const { responseHeaders, value: response } = await postJsonToApi({
      url: this.config.url,
      headers: combineHeaders(this.config.headers(), options.headers),
      body: {
        ...body,
        stream: true,
      } satisfies OpenResponsesRequestBody,
      failedResponseHandler: createJsonErrorResponseHandler({
        errorSchema: openResponsesErrorSchema,
        errorToMessage: error => error.error.message,
      }),
      // TODO consider validation
      successfulResponseHandler: createEventSourceResponseHandler(z.any()),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const usage: LanguageModelV3Usage = {
      inputTokens: {
        total: undefined,
        noCache: undefined,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: {
        total: undefined,
        text: undefined,
        reasoning: undefined,
      },
    };

    return {
      stream: response.pipeThrough(
        new TransformStream<ParseResult<OpenResponsesChunk>, LanguageModelV3StreamPart>({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings });
          },

          transform(parseResult, controller) {
            if (options.includeRawChunks) {
              controller.enqueue({ type: 'raw', rawValue: parseResult.rawValue });
            }

            if (!parseResult.success) {
              controller.enqueue({ type: 'error', error: parseResult.error });
              return;
            }


            const chunk = parseResult.value;

            if (chunk.type === 'response.output_item.added' && chunk.item.type === 'message') {
              controller.enqueue({ type: 'text-start', id: chunk.item.id });
            } else if (chunk.type === 'response.output_text.delta') {
              controller.enqueue({ type: 'text-delta', id: chunk.item_id, delta: chunk.delta });
            } else if (chunk.type === 'response.output_item.done' && chunk.item.type === 'message') {
              controller.enqueue({ type: 'text-end', id: chunk.item.id });
            }
          },

          flush(controller) {

            controller.enqueue({
              type: 'finish',
              finishReason: {
                unified: 'stop',
                raw: undefined,
              },
              usage,
              providerMetadata: undefined,
            });
          },
        }),
      ),
      request: { body },
      response: { headers: responseHeaders },
    };
  }
}

