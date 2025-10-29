import {
  LanguageModelV3,
  LanguageModelV3CallWarning,
  LanguageModelV3Content,
  LanguageModelV3FinishReason,
  LanguageModelV3StreamPart,
  LanguageModelV3Usage,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonResponseHandler,
  FetchFunction,
  parseProviderOptions,
  ParseResult,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { getResponseMetadata } from '../get-response-metadata';
import {
  xaiResponsesChunkSchema,
  xaiResponsesResponseSchema,
} from './xai-responses-api';
import { mapXaiResponsesFinishReason } from './map-xai-responses-finish-reason';
import {
  XaiResponsesModelId,
  xaiResponsesProviderOptions,
} from './xai-responses-options';
import { xaiFailedResponseHandler } from '../xai-error';
import { convertToXaiResponsesInput } from './convert-to-xai-responses-input';
import { prepareResponsesTools } from './xai-responses-prepare-tools';

type XaiResponsesConfig = {
  provider: string;
  baseURL: string | undefined;
  headers: () => Record<string, string | undefined>;
  generateId: () => string;
  fetch?: FetchFunction;
};

export class XaiResponsesLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = 'v3';

  readonly modelId: XaiResponsesModelId;

  private readonly config: XaiResponsesConfig;

  constructor(modelId: XaiResponsesModelId, config: XaiResponsesConfig) {
    this.modelId = modelId;
    this.config = config;
  }

  get provider(): string {
    return this.config.provider;
  }

  readonly supportedUrls: Record<string, RegExp[]> = {
    'image/*': [/^https?:\/\/.*$/],
  };

  private async getArgs({
    prompt,
    maxOutputTokens,
    temperature,
    topP,
    stopSequences,
    seed,
    providerOptions,
    tools,
    toolChoice,
  }: Parameters<LanguageModelV3['doGenerate']>[0]) {
    const warnings: LanguageModelV3CallWarning[] = [];

    const options =
      (await parseProviderOptions({
        provider: 'xai',
        providerOptions,
        schema: xaiResponsesProviderOptions,
      })) ?? {};

    if (stopSequences != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'stopSequences',
      });
    }

    const { input, inputWarnings } = await convertToXaiResponsesInput(prompt);
    warnings.push(...inputWarnings);

    const {
      tools: xaiTools,
      toolChoice: xaiToolChoice,
      toolWarnings,
    } = await prepareResponsesTools({
      tools,
      toolChoice,
    });
    warnings.push(...toolWarnings);

    const baseArgs: Record<string, unknown> = {
      model: this.modelId,
      input,
      max_tokens: maxOutputTokens,
      temperature,
      top_p: topP,
      seed,
      reasoning_effort: options.reasoningEffort,
    };

    if (xaiTools && xaiTools.length > 0) {
      baseArgs.tools = xaiTools;
    }

    if (xaiToolChoice != null) {
      baseArgs.tool_choice = xaiToolChoice;
    }

    return {
      args: baseArgs,
      warnings,
    };
  }

  async doGenerate(
    options: Parameters<LanguageModelV3['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV3['doGenerate']>>> {
    const { args: body, warnings } = await this.getArgs(options);

    const {
      responseHeaders,
      value: response,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url: `${this.config.baseURL ?? 'https://api.x.ai/v1'}/responses`,
      headers: combineHeaders(this.config.headers(), options.headers),
      body,
      failedResponseHandler: xaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        xaiResponsesResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const content: Array<LanguageModelV3Content> = [];

    for (const part of response.output) {
      if (
        part.type === 'web_search_call' ||
        part.type === 'x_search_call' ||
        part.type === 'code_interpreter_call' ||
        part.type === 'code_execution_call' ||
        part.type === 'view_image_call' ||
        part.type === 'view_x_video_call'
      ) {
        content.push({
          type: 'tool-call',
          toolCallId: part.id,
          toolName: part.name,
          input: part.arguments,
          providerExecuted: true,
        });

        content.push({
          type: 'tool-result',
          toolCallId: part.id,
          toolName: part.name,
          result: undefined,
          providerExecuted: true,
        });

        continue;
      }

      switch (part.type) {
        case 'message': {
          for (const contentPart of part.content) {
            if (contentPart.text) {
              content.push({
                type: 'text',
                text: contentPart.text,
              });
            }

            if (contentPart.annotations) {
              for (const annotation of contentPart.annotations) {
                if (
                  annotation.type === 'url_citation' &&
                  'url' in annotation
                ) {
                  content.push({
                    type: 'source',
                    sourceType: 'url',
                    id: this.config.generateId(),
                    url: annotation.url,
                    title: annotation.title,
                  });
                }
              }
            }
          }

          break;
        }

        case 'function_call': {
          content.push({
            type: 'tool-call',
            toolCallId: part.call_id,
            toolName: part.name,
            input: part.arguments,
          });
          break;
        }

        default: {
          break;
        }
      }
    }

    return {
      content,
      finishReason: mapXaiResponsesFinishReason(response.status),
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.total_tokens,
        reasoningTokens:
          response.usage.output_tokens_details?.reasoning_tokens,
      },
      request: { body },
      response: {
        ...getResponseMetadata(response),
        headers: responseHeaders,
        body: rawResponse,
      },
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
    };

    const { responseHeaders, value: response } = await postJsonToApi({
      url: `${this.config.baseURL ?? 'https://api.x.ai/v1'}/responses`,
      headers: combineHeaders(this.config.headers(), options.headers),
      body,
      failedResponseHandler: xaiFailedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(
        xaiResponsesChunkSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    let finishReason: LanguageModelV3FinishReason = 'unknown';
    const usage: LanguageModelV3Usage = {
      inputTokens: undefined,
      outputTokens: undefined,
      totalTokens: undefined,
    };
    let isFirstChunk = true;
    const contentBlocks: Record<string, { type: 'text' }> = {};
    const seenToolCalls = new Set<string>();

    const self = this;

    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<z.infer<typeof xaiResponsesChunkSchema>>,
          LanguageModelV3StreamPart
        >({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings });
          },

          transform(chunk, controller) {
            if (options.includeRawChunks) {
              controller.enqueue({ type: 'raw', rawValue: chunk.rawValue });
            }

            if (!chunk.success) {
              controller.enqueue({ type: 'error', error: chunk.error });
              return;
            }

            const event = chunk.value;

            if (
              event.type === 'response.created' ||
              event.type === 'response.in_progress'
            ) {
              if (isFirstChunk) {
                controller.enqueue({
                  type: 'response-metadata',
                  ...getResponseMetadata(event.response),
                });
                isFirstChunk = false;
              }
              return;
            }

            if (event.type === 'response.output_text.delta') {
              const blockId = `text-${event.item_id}`;

              if (contentBlocks[blockId] == null) {
                contentBlocks[blockId] = { type: 'text' };
                controller.enqueue({
                  type: 'text-start',
                  id: blockId,
                });
              }

              controller.enqueue({
                type: 'text-delta',
                id: blockId,
                delta: event.delta,
              });

              return;
            }

            if (event.type === 'response.output_text.done') {
              if (event.annotations) {
                for (const annotation of event.annotations) {
                  if (annotation.type === 'url_citation' && 'url' in annotation) {
                    controller.enqueue({
                      type: 'source',
                      sourceType: 'url',
                      id: self.config.generateId(),
                      url: annotation.url,
                      title: annotation.title,
                    });
                  }
                }
              }

              return;
            }

            if (event.type === 'response.output_text.annotation.added') {
              const annotation = event.annotation;
              if (annotation.type === 'url_citation' && 'url' in annotation) {
                controller.enqueue({
                  type: 'source',
                  sourceType: 'url',
                  id: self.config.generateId(),
                  url: annotation.url,
                  title: annotation.title,
                });
              }

              return;
            }

            if (event.type === 'response.done' || event.type === 'response.completed') {
              const response = event.response;

              if (response.usage) {
                usage.inputTokens = response.usage.input_tokens;
                usage.outputTokens = response.usage.output_tokens;
                usage.totalTokens = response.usage.total_tokens;
                usage.reasoningTokens =
                  response.usage.output_tokens_details?.reasoning_tokens;
              }

              if (response.status) {
                finishReason = mapXaiResponsesFinishReason(response.status);
              }

              return;
            }

            if (
              event.type === 'response.output_item.added' ||
              event.type === 'response.output_item.done'
            ) {
              const part = event.item;
              if (
                part.type === 'web_search_call' ||
                part.type === 'x_search_call' ||
                part.type === 'code_interpreter_call' ||
                part.type === 'code_execution_call' ||
                part.type === 'view_image_call' ||
                part.type === 'view_x_video_call'
              ) {
                if (!seenToolCalls.has(part.id)) {
                  seenToolCalls.add(part.id);

                  controller.enqueue({
                    type: 'tool-input-start',
                    id: part.id,
                    toolName: part.name,
                  });

                  controller.enqueue({
                    type: 'tool-input-delta',
                    id: part.id,
                    delta: part.arguments,
                  });

                  controller.enqueue({
                    type: 'tool-input-end',
                    id: part.id,
                  });

                  controller.enqueue({
                    type: 'tool-call',
                    toolCallId: part.id,
                    toolName: part.name,
                    input: part.arguments,
                    providerExecuted: true,
                  });

                  controller.enqueue({
                    type: 'tool-result',
                    toolCallId: part.id,
                    toolName: part.name,
                    result: undefined,
                    providerExecuted: true,
                  });
                }

                return;
              }

              if (part.type === 'message') {
                for (const contentPart of part.content) {
                  if (contentPart.text && contentPart.text.length > 0) {
                    const blockId = `text-${part.id}`;

                    if (contentBlocks[blockId] == null) {
                      contentBlocks[blockId] = { type: 'text' };
                      controller.enqueue({
                        type: 'text-start',
                        id: blockId,
                      });
                    }

                    controller.enqueue({
                      type: 'text-delta',
                      id: blockId,
                      delta: contentPart.text,
                    });
                  }

                  if (contentPart.annotations) {
                    for (const annotation of contentPart.annotations) {
                      if (
                        annotation.type === 'url_citation' &&
                        'url' in annotation
                      ) {
                        controller.enqueue({
                          type: 'source',
                          sourceType: 'url',
                          id: self.config.generateId(),
                          url: annotation.url,
                          title: annotation.title,
                        });
                      }
                    }
                  }
                }
              } else if (part.type === 'function_call') {
                if (!seenToolCalls.has(part.call_id)) {
                  seenToolCalls.add(part.call_id);

                  controller.enqueue({
                    type: 'tool-input-start',
                    id: part.call_id,
                    toolName: part.name,
                  });

                  controller.enqueue({
                    type: 'tool-input-delta',
                    id: part.call_id,
                    delta: part.arguments,
                  });

                  controller.enqueue({
                    type: 'tool-input-end',
                    id: part.call_id,
                  });

                  controller.enqueue({
                    type: 'tool-call',
                    toolCallId: part.call_id,
                    toolName: part.name,
                    input: part.arguments,
                  });
                }
              }
            }
          },

          flush(controller) {
            for (const [blockId, block] of Object.entries(contentBlocks)) {
              if (block.type === 'text') {
                controller.enqueue({
                  type: 'text-end',
                  id: blockId,
                });
              }
            }

            controller.enqueue({ type: 'finish', finishReason, usage });
          },
        }),
      ),
      request: { body },
      response: { headers: responseHeaders },
    };
  }
}
