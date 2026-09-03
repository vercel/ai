import {
  EmptyResponseBodyError,
  UnsupportedFunctionalityError,
  type LanguageModelV4,
  type LanguageModelV4CallOptions,
  type LanguageModelV4Content,
  type LanguageModelV4FinishReason,
  type LanguageModelV4GenerateResult,
  type LanguageModelV4Prompt,
  type LanguageModelV4StreamPart,
  type LanguageModelV4StreamResult,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  convertToBase64,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  extractResponseHeaders,
  getTopLevelMediaType,
  postJsonToApi,
  resolve,
  safeParseJSON,
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  type FetchFunction,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { AmazonBedrockErrorSchema } from './amazon-bedrock-error';
import { createAmazonBedrockEventStreamDecoder } from './amazon-bedrock-event-stream-decoder';

type AmazonBedrockPegasusConfig = {
  baseUrl: () => string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
};

const PegasusResponseSchema = z.object({
  message: z.string(),
  finishReason: z.enum(['stop', 'length']).nullish(),
});

const BedrockStreamChunkEnvelopeSchema = z.object({
  bytes: z.string(),
});

const PegasusStreamChunkSchema = z.object({
  message: z.string(),
  stopReason: z.enum(['', 'stop', 'length']),
  'amazon-bedrock-invocationMetrics': z
    .object({
      inputTokenCount: z.number(),
      outputTokenCount: z.number(),
      invocationLatency: z.number(),
      firstByteLatency: z.number(),
    })
    .nullish(),
});

/**
 * Returns whether a Bedrock model ID is a TwelveLabs Pegasus model, including
 * regional and global inference profile IDs (for example,
 * `us.twelvelabs.pegasus-1-2-v1:0`).
 */
export function isAmazonBedrockPegasusModelId(modelId: string): boolean {
  return /(?:^|\.)twelvelabs\.pegasus-/.test(modelId);
}

export class AmazonBedrockPegasusLanguageModel implements LanguageModelV4 {
  readonly specificationVersion = 'v4';
  readonly provider = 'amazon-bedrock';

  static [WORKFLOW_SERIALIZE](model: AmazonBedrockPegasusLanguageModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: string;
    config: AmazonBedrockPegasusConfig;
  }) {
    return new AmazonBedrockPegasusLanguageModel(
      options.modelId,
      options.config,
    );
  }

  constructor(
    readonly modelId: string,
    private readonly config: AmazonBedrockPegasusConfig,
  ) {}

  readonly supportedUrls: Record<string, RegExp[]> = {
    'video/*': [/^s3:\/\//],
  };

  async doGenerate(
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4GenerateResult> {
    const { args, warnings } = this.getArgs(options);
    const { value: response, responseHeaders } = await postJsonToApi({
      url: this.getUrl(),
      headers: await this.getHeaders(options.headers),
      body: args,
      failedResponseHandler: createJsonErrorResponseHandler({
        errorSchema: AmazonBedrockErrorSchema,
        errorToMessage: error => error.message ?? 'Unknown error',
      }),
      successfulResponseHandler: createJsonResponseHandler(
        PegasusResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const content: Array<LanguageModelV4Content> = [
      { type: 'text', text: response.message },
    ];

    return {
      content,
      finishReason: {
        unified: response.finishReason === 'length' ? 'length' : 'stop',
        raw: response.finishReason ?? undefined,
      },
      usage: {
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
      },
      response: {
        id: responseHeaders?.['x-amzn-requestid'] ?? undefined,
        timestamp:
          responseHeaders?.date != null
            ? new Date(responseHeaders.date)
            : undefined,
        modelId: this.modelId,
        headers: responseHeaders,
      },
      warnings,
      request: { body: args },
    };
  }

  async doStream(
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4StreamResult> {
    const { args, warnings } = this.getArgs(options);
    const { value: response, responseHeaders } = await postJsonToApi({
      url: `${this.getUrl()}-with-response-stream`,
      headers: await this.getHeaders(options.headers),
      body: args,
      failedResponseHandler: createJsonErrorResponseHandler({
        errorSchema: AmazonBedrockErrorSchema,
        errorToMessage: error => error.message ?? 'Unknown error',
      }),
      successfulResponseHandler: async ({ response }) => {
        if (response.body == null) {
          throw new EmptyResponseBodyError({});
        }

        return {
          value: createPegasusStream(response.body),
          responseHeaders: extractResponseHeaders(response),
        };
      },
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const modelId = this.modelId;
    let finishReason: LanguageModelV4FinishReason = {
      unified: 'other',
      raw: undefined,
    };
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    let textStarted = false;

    return {
      stream: response.pipeThrough(
        new TransformStream<
          Awaited<ReturnType<typeof parsePegasusStreamEvent>>,
          LanguageModelV4StreamPart
        >({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings });
            controller.enqueue({
              type: 'response-metadata',
              id: responseHeaders?.['x-amzn-requestid'] ?? undefined,
              timestamp:
                responseHeaders?.date != null
                  ? new Date(responseHeaders.date)
                  : undefined,
              modelId,
            });
          },
          transform(chunk, controller) {
            if (options.includeRawChunks) {
              controller.enqueue({ type: 'raw', rawValue: chunk.rawValue });
            }

            if (!chunk.success) {
              finishReason = { unified: 'error', raw: undefined };
              controller.enqueue({ type: 'error', error: chunk.error });
              return;
            }

            const value = chunk.value;
            if (value.message.length > 0) {
              if (!textStarted) {
                textStarted = true;
                controller.enqueue({ type: 'text-start', id: '0' });
              }
              controller.enqueue({
                type: 'text-delta',
                id: '0',
                delta: value.message,
              });
            }

            if (value.stopReason !== '') {
              finishReason = {
                unified: value.stopReason === 'length' ? 'length' : 'stop',
                raw: value.stopReason,
              };
            }

            if (value['amazon-bedrock-invocationMetrics'] != null) {
              inputTokens =
                value['amazon-bedrock-invocationMetrics'].inputTokenCount;
              outputTokens =
                value['amazon-bedrock-invocationMetrics'].outputTokenCount;
            }
          },
          flush(controller) {
            if (textStarted) {
              controller.enqueue({ type: 'text-end', id: '0' });
            }
            controller.enqueue({
              type: 'finish',
              finishReason,
              usage: {
                inputTokens: {
                  total: inputTokens,
                  noCache: inputTokens,
                  cacheRead: undefined,
                  cacheWrite: undefined,
                },
                outputTokens: {
                  total: outputTokens,
                  text: outputTokens,
                  reasoning: undefined,
                },
              },
            });
          },
        }),
      ),
      request: { body: args },
      response: { headers: responseHeaders },
    };
  }

  private getArgs(options: LanguageModelV4CallOptions) {
    const warnings: Array<SharedV4Warning> = [];

    for (const feature of [
      'topP',
      'topK',
      'frequencyPenalty',
      'presencePenalty',
      'stopSequences',
      'seed',
      'reasoning',
      'tools',
      'toolChoice',
    ] as const) {
      if (
        feature === 'toolChoice' &&
        options.toolChoice?.type === 'auto' &&
        (options.tools == null || options.tools.length === 0)
      ) {
        continue;
      }

      if (options[feature] != null) {
        warnings.push({ type: 'unsupported', feature });
      }
    }

    let temperature = options.temperature;
    if (temperature != null && temperature > 1) {
      warnings.push({
        type: 'unsupported',
        feature: 'temperature',
        details:
          'temperature exceeds Bedrock Pegasus maximum of 1.0. Clamped to 1.0.',
      });
      temperature = 1;
    } else if (temperature != null && temperature < 0) {
      warnings.push({
        type: 'unsupported',
        feature: 'temperature',
        details:
          'temperature is below Bedrock Pegasus minimum of 0. Clamped to 0.',
      });
      temperature = 0;
    }

    const responseFormat = options.responseFormat;
    if (responseFormat?.type === 'json' && responseFormat.schema == null) {
      warnings.push({
        type: 'unsupported',
        feature: 'responseFormat',
        details:
          'Bedrock Pegasus requires a JSON schema for structured output.',
      });
    }

    const { inputPrompt, mediaSource } = convertToPegasusPrompt(options.prompt);

    return {
      args: {
        inputPrompt,
        mediaSource,
        ...(temperature != null && { temperature }),
        ...(options.maxOutputTokens != null && {
          maxOutputTokens: options.maxOutputTokens,
        }),
        ...(responseFormat?.type === 'json' &&
          responseFormat.schema != null && {
            responseFormat: { jsonSchema: responseFormat.schema },
          }),
      },
      warnings,
    };
  }

  private async getHeaders(
    headers: Record<string, string | undefined> | undefined,
  ) {
    return combineHeaders(
      this.config.headers ? await resolve(this.config.headers) : undefined,
      headers,
    );
  }

  private getUrl() {
    return `${this.config.baseUrl()}/model/${encodeURIComponent(this.modelId)}/invoke`;
  }
}

function createPegasusStream(
  body: ReadableStream<Uint8Array>,
): ReadableStream<Awaited<ReturnType<typeof parsePegasusStreamEvent>>> {
  return createAmazonBedrockEventStreamDecoder(
    body,
    async (event, controller) => {
      if (event.messageType !== 'event' || event.eventType !== 'chunk') {
        return;
      }

      controller.enqueue(await parsePegasusStreamEvent(event.data));
    },
  );
}

async function parsePegasusStreamEvent(eventData: string) {
  const envelope = await safeParseJSON({
    text: eventData,
    schema: BedrockStreamChunkEnvelopeSchema,
  });

  if (!envelope.success) {
    return envelope;
  }

  return safeParseJSON({
    text: new TextDecoder().decode(
      convertBase64ToUint8Array(envelope.value.bytes),
    ),
    schema: PegasusStreamChunkSchema,
  });
}

function convertToPegasusPrompt(prompt: LanguageModelV4Prompt): {
  inputPrompt: string;
  mediaSource: { base64String: string } | { s3Location: { uri: string } };
} {
  const text: Array<string> = [];
  let mediaSource:
    | { base64String: string }
    | { s3Location: { uri: string } }
    | undefined;

  for (const message of prompt) {
    if (message.role === 'system') {
      text.push(message.content);
      continue;
    }

    if (message.role !== 'user') {
      throw new UnsupportedFunctionalityError({
        functionality: `Pegasus prompt role: ${message.role}`,
      });
    }

    for (const part of message.content) {
      if (part.type === 'text') {
        text.push(part.text);
        continue;
      }

      if (
        part.type !== 'file' ||
        getTopLevelMediaType(part.mediaType) !== 'video'
      ) {
        throw new UnsupportedFunctionalityError({
          functionality: `Pegasus prompt part: ${part.type}`,
        });
      }

      if (mediaSource != null) {
        throw new UnsupportedFunctionalityError({
          functionality: 'multiple videos with TwelveLabs Pegasus',
        });
      }

      switch (part.data.type) {
        case 'data':
          mediaSource = { base64String: convertToBase64(part.data.data) };
          break;
        case 'url':
          if (part.data.url.protocol !== 's3:') {
            throw new UnsupportedFunctionalityError({
              functionality: 'non-S3 video URLs with TwelveLabs Pegasus',
            });
          }
          mediaSource = { s3Location: { uri: part.data.url.toString() } };
          break;
        default:
          throw new UnsupportedFunctionalityError({
            functionality: `Pegasus video source: ${part.data.type}`,
          });
      }
    }
  }

  if (mediaSource == null) {
    throw new UnsupportedFunctionalityError({
      functionality: 'TwelveLabs Pegasus without a video input',
    });
  }

  return { inputPrompt: text.join('\n'), mediaSource };
}
