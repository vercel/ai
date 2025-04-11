import {
  LanguageModelV2,
  LanguageModelV2CallWarning,
  LanguageModelV2FinishReason,
  LanguageModelV2ProviderMetadata,
  LanguageModelV2Source,
  LanguageModelV2StreamPart,
  LanguageModelV2Usage,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  ParseResult,
  Resolvable,
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonResponseHandler,
  parseProviderOptions,
  postJsonToApi,
  resolve,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { convertJSONSchemaToOpenAPISchema } from './convert-json-schema-to-openapi-schema';
import { convertToGoogleGenerativeAIMessages } from './convert-to-google-generative-ai-messages';
import { getModelPath } from './get-model-path';
import { googleFailedResponseHandler } from './google-error';
import { GoogleGenerativeAIContentPart } from './google-generative-ai-prompt';
import {
  GoogleGenerativeAIModelId,
  InternalGoogleGenerativeAISettings,
} from './google-generative-ai-settings';
import { prepareTools } from './google-prepare-tools';
import { mapGoogleGenerativeAIFinishReason } from './map-google-generative-ai-finish-reason';

type GoogleGenerativeAIConfig = {
  provider: string;
  baseURL: string;
  headers: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  generateId: () => string;
  isSupportedUrl: (url: URL) => boolean;
};

export class GoogleGenerativeAILanguageModel implements LanguageModelV2 {
  readonly specificationVersion = 'v2';
  readonly defaultObjectGenerationMode = 'json';
  readonly supportsImageUrls = false;

  get supportsStructuredOutputs() {
    return this.settings.structuredOutputs ?? true;
  }

  readonly modelId: GoogleGenerativeAIModelId;
  readonly settings: InternalGoogleGenerativeAISettings;

  private readonly config: GoogleGenerativeAIConfig;

  constructor(
    modelId: GoogleGenerativeAIModelId,
    settings: InternalGoogleGenerativeAISettings,
    config: GoogleGenerativeAIConfig,
  ) {
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
  }

  get provider(): string {
    return this.config.provider;
  }

  private async getArgs({
    prompt,
    maxOutputTokens,
    temperature,
    topP,
    topK,
    frequencyPenalty,
    presencePenalty,
    stopSequences,
    responseFormat,
    seed,
    tools,
    toolChoice,
    providerOptions,
  }: Parameters<LanguageModelV2['doGenerate']>[0]) {
    const warnings: LanguageModelV2CallWarning[] = [];

    const googleOptions = parseProviderOptions({
      provider: 'google',
      providerOptions,
      schema: googleGenerativeAIProviderOptionsSchema,
    });

    const { contents, systemInstruction } =
      convertToGoogleGenerativeAIMessages(prompt);

    const {
      tools: googleTools,
      toolConfig: googleToolConfig,
      toolWarnings,
    } = prepareTools({
      tools,
      toolChoice,
      useSearchGrounding: this.settings.useSearchGrounding ?? false,
      dynamicRetrievalConfig: this.settings.dynamicRetrievalConfig,
      modelId: this.modelId,
    });

    return {
      args: {
        generationConfig: {
          // standardized settings:
          maxOutputTokens: maxOutputTokens,
          temperature,
          topK,
          topP,
          frequencyPenalty,
          presencePenalty,
          stopSequences,
          seed,

          // response format:
          responseMimeType:
            responseFormat?.type === 'json' ? 'application/json' : undefined,
          responseSchema:
            responseFormat?.type === 'json' &&
            responseFormat.schema != null &&
            // Google GenAI does not support all OpenAPI Schema features,
            // so this is needed as an escape hatch:
            this.supportsStructuredOutputs
              ? convertJSONSchemaToOpenAPISchema(responseFormat.schema)
              : undefined,
          ...(this.settings.audioTimestamp && {
            audioTimestamp: this.settings.audioTimestamp,
          }),

          // provider options:
          responseModalities: googleOptions?.responseModalities,
        },
        contents,
        systemInstruction,
        safetySettings: this.settings.safetySettings,
        tools: googleTools,
        toolConfig: googleToolConfig,
        cachedContent: this.settings.cachedContent,
      },
      warnings: [...warnings, ...toolWarnings],
    };
  }

  supportsUrl(url: URL): boolean {
    return this.config.isSupportedUrl(url);
  }

  async doGenerate(
    options: Parameters<LanguageModelV2['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV2['doGenerate']>>> {
    const { args, warnings } = await this.getArgs(options);
    const body = JSON.stringify(args);

    const mergedHeaders = combineHeaders(
      await resolve(this.config.headers),
      options.headers,
    );

    const {
      responseHeaders,
      value: response,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url: `${this.config.baseURL}/${getModelPath(
        this.modelId,
      )}:generateContent`,
      headers: mergedHeaders,
      body: args,
      failedResponseHandler: googleFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(responseSchema),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const candidate = response.candidates[0];

    const parts =
      candidate.content == null ||
      typeof candidate.content !== 'object' ||
      !('parts' in candidate.content)
        ? []
        : candidate.content.parts;

    const toolCalls = getToolCallsFromParts({
      parts,
      generateId: this.config.generateId,
    });

    const usageMetadata = response.usageMetadata;

    return {
      text: getTextFromParts(parts),
      files: getInlineDataParts(parts)?.map(part => ({
        data: part.inlineData.data,
        mediaType: part.inlineData.mimeType,
      })),
      toolCalls,
      finishReason: mapGoogleGenerativeAIFinishReason({
        finishReason: candidate.finishReason,
        hasToolCalls: toolCalls != null && toolCalls.length > 0,
      }),
      usage: {
        inputTokens: usageMetadata?.promptTokenCount ?? undefined,
        outputTokens: usageMetadata?.candidatesTokenCount ?? undefined,
      },
      warnings,
      providerMetadata: {
        google: {
          groundingMetadata: candidate.groundingMetadata ?? null,
          safetyRatings: candidate.safetyRatings ?? null,
        },
      },
      sources: extractSources({
        groundingMetadata: candidate.groundingMetadata,
        generateId: this.config.generateId,
      }),
      request: { body },
      response: {
        // TODO timestamp, model id, id
        headers: responseHeaders,
        body: rawResponse,
      },
    };
  }

  async doStream(
    options: Parameters<LanguageModelV2['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV2['doStream']>>> {
    const { args, warnings } = await this.getArgs(options);

    const body = JSON.stringify(args);
    const headers = combineHeaders(
      await resolve(this.config.headers),
      options.headers,
    );

    const { responseHeaders, value: response } = await postJsonToApi({
      url: `${this.config.baseURL}/${getModelPath(
        this.modelId,
      )}:streamGenerateContent?alt=sse`,
      headers,
      body: args,
      failedResponseHandler: googleFailedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(chunkSchema),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    let finishReason: LanguageModelV2FinishReason = 'unknown';
    const usage: LanguageModelV2Usage = {
      inputTokens: undefined,
      outputTokens: undefined,
    };
    let providerMetadata: LanguageModelV2ProviderMetadata | undefined =
      undefined;

    const generateId = this.config.generateId;
    let hasToolCalls = false;

    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<z.infer<typeof chunkSchema>>,
          LanguageModelV2StreamPart
        >({
          transform(chunk, controller) {
            if (!chunk.success) {
              controller.enqueue({ type: 'error', error: chunk.error });
              return;
            }

            const value = chunk.value;

            const usageMetadata = value.usageMetadata;

            if (usageMetadata != null) {
              usage.inputTokens = usageMetadata.promptTokenCount ?? undefined;
              usage.outputTokens =
                usageMetadata.candidatesTokenCount ?? undefined;
            }

            const candidate = value.candidates?.[0];

            // sometimes the API returns an empty candidates array
            if (candidate == null) {
              return;
            }

            const content = candidate.content;

            // Process tool call's parts before determining finishReason to ensure hasToolCalls is properly set
            if (content != null) {
              const deltaText = getTextFromParts(content.parts);
              if (deltaText != null) {
                controller.enqueue({
                  type: 'text-delta',
                  textDelta: deltaText,
                });
              }

              const inlineDataParts = getInlineDataParts(content.parts);
              if (inlineDataParts != null) {
                for (const part of inlineDataParts) {
                  controller.enqueue({
                    type: 'file',
                    mediaType: part.inlineData.mimeType,
                    data: part.inlineData.data,
                  });
                }
              }

              const toolCallDeltas = getToolCallsFromParts({
                parts: content.parts,
                generateId,
              });

              if (toolCallDeltas != null) {
                for (const toolCall of toolCallDeltas) {
                  controller.enqueue({
                    type: 'tool-call-delta',
                    toolCallType: 'function',
                    toolCallId: toolCall.toolCallId,
                    toolName: toolCall.toolName,
                    argsTextDelta: toolCall.args,
                  });

                  controller.enqueue({
                    type: 'tool-call',
                    toolCallType: 'function',
                    toolCallId: toolCall.toolCallId,
                    toolName: toolCall.toolName,
                    args: toolCall.args,
                  });

                  hasToolCalls = true;
                }
              }
            }

            if (candidate.finishReason != null) {
              finishReason = mapGoogleGenerativeAIFinishReason({
                finishReason: candidate.finishReason,
                hasToolCalls,
              });

              const sources =
                extractSources({
                  groundingMetadata: candidate.groundingMetadata,
                  generateId,
                }) ?? [];

              for (const source of sources) {
                controller.enqueue({ type: 'source', source });
              }

              providerMetadata = {
                google: {
                  groundingMetadata: candidate.groundingMetadata ?? null,
                  safetyRatings: candidate.safetyRatings ?? null,
                },
              };
            }
          },

          flush(controller) {
            controller.enqueue({
              type: 'finish',
              finishReason,
              usage,
              providerMetadata,
            });
          },
        }),
      ),
      response: { headers: responseHeaders },
      warnings,
      request: { body },
    };
  }
}

function getToolCallsFromParts({
  parts,
  generateId,
}: {
  parts: z.infer<typeof contentSchema>['parts'];
  generateId: () => string;
}) {
  const functionCallParts = parts?.filter(
    part => 'functionCall' in part,
  ) as Array<
    GoogleGenerativeAIContentPart & {
      functionCall: { name: string; args: unknown };
    }
  >;

  return functionCallParts == null || functionCallParts.length === 0
    ? undefined
    : functionCallParts.map(part => ({
        toolCallType: 'function' as const,
        toolCallId: generateId(),
        toolName: part.functionCall.name,
        args: JSON.stringify(part.functionCall.args),
      }));
}

function getTextFromParts(parts: z.infer<typeof contentSchema>['parts']) {
  const textParts = parts?.filter(part => 'text' in part) as Array<
    GoogleGenerativeAIContentPart & { text: string }
  >;

  return textParts == null || textParts.length === 0
    ? undefined
    : textParts.map(part => part.text).join('');
}

function getInlineDataParts(parts: z.infer<typeof contentSchema>['parts']) {
  return parts?.filter(
    (
      part,
    ): part is {
      inlineData: { mimeType: string; data: string };
    } => 'inlineData' in part,
  );
}

function extractSources({
  groundingMetadata,
  generateId,
}: {
  groundingMetadata: z.infer<typeof groundingMetadataSchema> | undefined | null;
  generateId: () => string;
}): undefined | LanguageModelV2Source[] {
  return groundingMetadata?.groundingChunks
    ?.filter(
      (
        chunk,
      ): chunk is z.infer<typeof groundingChunkSchema> & {
        web: { uri: string; title?: string };
      } => chunk.web != null,
    )
    .map(chunk => ({
      sourceType: 'url',
      id: generateId(),
      url: chunk.web.uri,
      title: chunk.web.title,
    }));
}

const contentSchema = z.object({
  role: z.string(),
  parts: z
    .array(
      z.union([
        z.object({
          text: z.string(),
        }),
        z.object({
          functionCall: z.object({
            name: z.string(),
            args: z.unknown(),
          }),
        }),
        z.object({
          inlineData: z.object({
            mimeType: z.string(),
            data: z.string(),
          }),
        }),
      ]),
    )
    .nullish(),
});

// https://ai.google.dev/gemini-api/docs/grounding
// https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/ground-gemini#ground-to-search
const groundingChunkSchema = z.object({
  web: z.object({ uri: z.string(), title: z.string() }).nullish(),
  retrievedContext: z.object({ uri: z.string(), title: z.string() }).nullish(),
});

export const groundingMetadataSchema = z.object({
  webSearchQueries: z.array(z.string()).nullish(),
  retrievalQueries: z.array(z.string()).nullish(),
  searchEntryPoint: z.object({ renderedContent: z.string() }).nullish(),
  groundingChunks: z.array(groundingChunkSchema).nullish(),
  groundingSupports: z
    .array(
      z.object({
        segment: z.object({
          startIndex: z.number().nullish(),
          endIndex: z.number().nullish(),
          text: z.string().nullish(),
        }),
        segment_text: z.string().nullish(),
        groundingChunkIndices: z.array(z.number()).nullish(),
        supportChunkIndices: z.array(z.number()).nullish(),
        confidenceScores: z.array(z.number()).nullish(),
        confidenceScore: z.array(z.number()).nullish(),
      }),
    )
    .nullish(),
  retrievalMetadata: z
    .union([
      z.object({
        webDynamicRetrievalScore: z.number(),
      }),
      z.object({}),
    ])
    .nullish(),
});

// https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/configure-safety-filters
export const safetyRatingSchema = z.object({
  category: z.string(),
  probability: z.string(),
  probabilityScore: z.number().nullish(),
  severity: z.string().nullish(),
  severityScore: z.number().nullish(),
  blocked: z.boolean().nullish(),
});

const responseSchema = z.object({
  candidates: z.array(
    z.object({
      content: contentSchema.nullish().or(z.object({}).strict()),
      finishReason: z.string().nullish(),
      safetyRatings: z.array(safetyRatingSchema).nullish(),
      groundingMetadata: groundingMetadataSchema.nullish(),
    }),
  ),
  usageMetadata: z
    .object({
      promptTokenCount: z.number().nullish(),
      candidatesTokenCount: z.number().nullish(),
      totalTokenCount: z.number().nullish(),
    })
    .nullish(),
});

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const chunkSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: contentSchema.nullish(),
        finishReason: z.string().nullish(),
        safetyRatings: z.array(safetyRatingSchema).nullish(),
        groundingMetadata: groundingMetadataSchema.nullish(),
      }),
    )
    .nullish(),
  usageMetadata: z
    .object({
      promptTokenCount: z.number().nullish(),
      candidatesTokenCount: z.number().nullish(),
      totalTokenCount: z.number().nullish(),
    })
    .nullish(),
});

const googleGenerativeAIProviderOptionsSchema = z.object({
  responseModalities: z.array(z.enum(['TEXT', 'IMAGE'])).nullish(),
});
export type GoogleGenerativeAIProviderOptions = z.infer<
  typeof googleGenerativeAIProviderOptionsSchema
>;
