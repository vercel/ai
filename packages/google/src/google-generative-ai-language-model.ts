import {
  LanguageModelV1,
  LanguageModelV1CallWarning,
  LanguageModelV1FinishReason,
  LanguageModelV1StreamPart,
  LanguageModelV1ProviderMetadata,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  ParseResult,
  Resolvable,
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonResponseHandler,
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
  generateId: () => string;
  fetch?: FetchFunction;
};

export class GoogleGenerativeAILanguageModel implements LanguageModelV1 {
  readonly specificationVersion = 'v1';
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
    mode,
    prompt,
    maxTokens,
    temperature,
    topP,
    topK,
    frequencyPenalty,
    presencePenalty,
    stopSequences,
    responseFormat,
    seed,
  }: Parameters<LanguageModelV1['doGenerate']>[0]) {
    const type = mode.type;

    const warnings: LanguageModelV1CallWarning[] = [];

    if (seed != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'seed',
      });
    }

    const generationConfig = {
      // standardized settings:
      maxOutputTokens: maxTokens,
      temperature,
      topK,
      topP,
      frequencyPenalty,
      presencePenalty,
      stopSequences,

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
    };

    const { contents, systemInstruction } =
      convertToGoogleGenerativeAIMessages(prompt);

    switch (type) {
      case 'regular': {
        const { tools, toolConfig, toolWarnings } = prepareTools(
          mode,
          this.settings.useSearchGrounding ?? false,
          this.modelId.includes('gemini-2'),
        );

        return {
          args: {
            generationConfig,
            contents,
            systemInstruction,
            safetySettings: this.settings.safetySettings,
            tools,
            toolConfig,
            cachedContent: this.settings.cachedContent,
          },
          warnings: [...warnings, ...toolWarnings],
        };
      }

      case 'object-json': {
        return {
          args: {
            generationConfig: {
              ...generationConfig,
              responseMimeType: 'application/json',
              responseSchema:
                mode.schema != null &&
                // Google GenAI does not support all OpenAPI Schema features,
                // so this is needed as an escape hatch:
                this.supportsStructuredOutputs
                  ? convertJSONSchemaToOpenAPISchema(mode.schema)
                  : undefined,
            },
            contents,
            systemInstruction,
            safetySettings: this.settings.safetySettings,
            cachedContent: this.settings.cachedContent,
          },
          warnings,
        };
      }

      case 'object-tool': {
        return {
          args: {
            generationConfig,
            contents,
            tools: {
              functionDeclarations: [
                {
                  name: mode.tool.name,
                  description: mode.tool.description ?? '',
                  parameters: convertJSONSchemaToOpenAPISchema(
                    mode.tool.parameters,
                  ),
                },
              ],
            },
            toolConfig: { functionCallingConfig: { mode: 'ANY' } },
            safetySettings: this.settings.safetySettings,
            cachedContent: this.settings.cachedContent,
          },
          warnings,
        };
      }

      default: {
        const _exhaustiveCheck: never = type;
        throw new Error(`Unsupported type: ${_exhaustiveCheck}`);
      }
    }
  }

  supportsUrl(url: URL): boolean {
    return url
      .toString()
      .startsWith('https://generativelanguage.googleapis.com/v1beta/files/');
  }

  async doGenerate(
    options: Parameters<LanguageModelV1['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV1['doGenerate']>>> {
    const { args, warnings } = await this.getArgs(options);
    const body = JSON.stringify(args);

    const mergedHeaders = combineHeaders(
      await resolve(this.config.headers),
      options.headers,
    );

    const { responseHeaders, value: response } = await postJsonToApi({
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

    const { contents: rawPrompt, ...rawSettings } = args;
    const candidate = response.candidates[0];

    const toolCalls = getToolCallsFromParts({
      parts: candidate.content?.parts ?? [],
      generateId: this.config.generateId,
    });

    const usageMetadata = response.usageMetadata;

    return {
      text: getTextFromParts(candidate.content?.parts ?? []),
      toolCalls,
      finishReason: mapGoogleGenerativeAIFinishReason({
        finishReason: candidate.finishReason,
        hasToolCalls: toolCalls != null && toolCalls.length > 0,
      }),
      usage: {
        promptTokens: usageMetadata?.promptTokenCount ?? NaN,
        completionTokens: usageMetadata?.candidatesTokenCount ?? NaN,
      },
      rawCall: { rawPrompt, rawSettings },
      rawResponse: { headers: responseHeaders },
      warnings,
      providerMetadata: {
        google: {
          groundingMetadata: candidate.groundingMetadata ?? null,
          safetyRatings: candidate.safetyRatings ?? null,
        },
      },
      request: { body },
    };
  }

  async doStream(
    options: Parameters<LanguageModelV1['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV1['doStream']>>> {
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

    const { contents: rawPrompt, ...rawSettings } = args;

    let finishReason: LanguageModelV1FinishReason = 'unknown';
    let usage: { promptTokens: number; completionTokens: number } = {
      promptTokens: Number.NaN,
      completionTokens: Number.NaN,
    };
    let providerMetadata: LanguageModelV1ProviderMetadata | undefined =
      undefined;

    const generateId = this.config.generateId;
    let hasToolCalls = false;

    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<z.infer<typeof chunkSchema>>,
          LanguageModelV1StreamPart
        >({
          transform(chunk, controller) {
            if (!chunk.success) {
              controller.enqueue({ type: 'error', error: chunk.error });
              return;
            }

            const value = chunk.value;

            const usageMetadata = value.usageMetadata;

            if (usageMetadata != null) {
              usage = {
                promptTokens: usageMetadata.promptTokenCount ?? NaN,
                completionTokens: usageMetadata.candidatesTokenCount ?? NaN,
              };
            }

            const candidate = value.candidates?.[0];

            // sometimes the API returns an empty candidates array
            if (candidate == null) {
              return;
            }

            if (candidate.finishReason != null) {
              finishReason = mapGoogleGenerativeAIFinishReason({
                finishReason: candidate.finishReason,
                hasToolCalls,
              });

              providerMetadata = {
                google: {
                  groundingMetadata: candidate.groundingMetadata ?? null,
                  safetyRatings: candidate.safetyRatings ?? null,
                },
              };
            }

            const content = candidate.content;

            if (content == null) {
              return;
            }

            const deltaText = getTextFromParts(content.parts);
            if (deltaText != null) {
              controller.enqueue({
                type: 'text-delta',
                textDelta: deltaText,
              });
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
      rawCall: { rawPrompt, rawSettings },
      rawResponse: { headers: responseHeaders },
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
  const functionCallParts = parts.filter(
    part => 'functionCall' in part,
  ) as Array<
    GoogleGenerativeAIContentPart & {
      functionCall: { name: string; args: unknown };
    }
  >;

  return functionCallParts.length === 0
    ? undefined
    : functionCallParts.map(part => ({
        toolCallType: 'function' as const,
        toolCallId: generateId(),
        toolName: part.functionCall.name,
        args: JSON.stringify(part.functionCall.args),
      }));
}

function getTextFromParts(parts: z.infer<typeof contentSchema>['parts']) {
  const textParts = parts.filter(part => 'text' in part) as Array<
    GoogleGenerativeAIContentPart & { text: string }
  >;

  return textParts.length === 0
    ? undefined
    : textParts.map(part => part.text).join('');
}

const contentSchema = z.object({
  role: z.string(),
  parts: z.array(
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
    ]),
  ),
});

// https://ai.google.dev/gemini-api/docs/grounding
// https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/ground-gemini#ground-to-search
export const groundingMetadataSchema = z.object({
  webSearchQueries: z.array(z.string()).nullish(),
  retrievalQueries: z.array(z.string()).nullish(),
  searchEntryPoint: z
    .object({
      renderedContent: z.string(),
    })
    .nullish(),
  groundingChunks: z
    .array(
      z.object({
        web: z
          .object({
            uri: z.string(),
            title: z.string(),
          })
          .nullish(),
        retrievedContext: z
          .object({
            uri: z.string(),
            title: z.string(),
          })
          .nullish(),
      }),
    )
    .nullish(),
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
      content: contentSchema.nullish(),
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
