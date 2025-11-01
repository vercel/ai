import {
  LanguageModelV3,
  LanguageModelV3CallWarning,
  LanguageModelV3Content,
  LanguageModelV3FinishReason,
  LanguageModelV3Source,
  LanguageModelV3StreamPart,
  LanguageModelV3Usage,
  SharedV3ProviderMetadata,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  InferSchema,
  ParseResult,
  Resolvable,
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonResponseHandler,
  generateId,
  lazySchema,
  parseProviderOptions,
  postJsonToApi,
  resolve,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { convertJSONSchemaToOpenAPISchema } from './convert-json-schema-to-openapi-schema';
import { convertToGoogleGenerativeAIMessages } from './convert-to-google-generative-ai-messages';
import { getModelPath } from './get-model-path';
import { googleFailedResponseHandler } from './google-error';
import { GoogleGenerativeAIContentPart } from './google-generative-ai-prompt';
import {
  GoogleGenerativeAIModelId,
  googleGenerativeAIProviderOptions,
} from './google-generative-ai-options';
import { prepareTools } from './google-prepare-tools';
import { mapGoogleGenerativeAIFinishReason } from './map-google-generative-ai-finish-reason';

type GoogleGenerativeAIConfig = {
  provider: string;
  baseURL: string;
  headers: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  generateId: () => string;

  /**
   * The supported URLs for the model.
   */
  supportedUrls?: () => LanguageModelV3['supportedUrls'];
};

export class GoogleGenerativeAILanguageModel implements LanguageModelV3 {
  readonly specificationVersion = 'v3';

  readonly modelId: GoogleGenerativeAIModelId;

  private readonly config: GoogleGenerativeAIConfig;
  private readonly generateId: () => string;

  constructor(
    modelId: GoogleGenerativeAIModelId,
    config: GoogleGenerativeAIConfig,
  ) {
    this.modelId = modelId;
    this.config = config;
    this.generateId = config.generateId ?? generateId;
  }

  get provider(): string {
    return this.config.provider;
  }

  get supportedUrls() {
    return this.config.supportedUrls?.() ?? {};
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
  }: Parameters<LanguageModelV3['doGenerate']>[0]) {
    const warnings: LanguageModelV3CallWarning[] = [];

    const googleOptions = await parseProviderOptions({
      provider: 'google',
      providerOptions,
      schema: googleGenerativeAIProviderOptions,
    });

    // Add warning if includeThoughts is used with a non-Vertex Google provider
    if (
      googleOptions?.thinkingConfig?.includeThoughts === true &&
      !this.config.provider.startsWith('google.vertex.')
    ) {
      warnings.push({
        type: 'other',
        message:
          "The 'includeThoughts' option is only supported with the Google Vertex provider " +
          'and might not be supported or could behave unexpectedly with the current Google provider ' +
          `(${this.config.provider}).`,
      });
    }

    const isGemmaModel = this.modelId.toLowerCase().startsWith('gemma-');

    const { contents, systemInstruction } = convertToGoogleGenerativeAIMessages(
      prompt,
      { isGemmaModel },
    );

    const {
      tools: googleTools,
      toolConfig: googleToolConfig,
      toolWarnings,
    } = prepareTools({
      tools,
      toolChoice,
      modelId: this.modelId,
    });

    return {
      args: {
        generationConfig: {
          // standardized settings:
          maxOutputTokens,
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
            // TODO convert into provider option
            (googleOptions?.structuredOutputs ?? true)
              ? convertJSONSchemaToOpenAPISchema(responseFormat.schema)
              : undefined,
          ...(googleOptions?.audioTimestamp && {
            audioTimestamp: googleOptions.audioTimestamp,
          }),

          // provider options:
          responseModalities: googleOptions?.responseModalities,
          thinkingConfig: googleOptions?.thinkingConfig,
          ...(googleOptions?.mediaResolution && {
            mediaResolution: googleOptions.mediaResolution,
          }),
          ...(googleOptions?.imageConfig && {
            imageConfig: googleOptions.imageConfig,
          }),
        },
        contents,
        systemInstruction: isGemmaModel ? undefined : systemInstruction,
        safetySettings: googleOptions?.safetySettings,
        tools: googleTools,
        toolConfig: googleToolConfig,
        cachedContent: googleOptions?.cachedContent,
        labels: googleOptions?.labels,
      },
      warnings: [...warnings, ...toolWarnings],
    };
  }

  async doGenerate(
    options: Parameters<LanguageModelV3['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV3['doGenerate']>>> {
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
    const content: Array<LanguageModelV3Content> = [];

    // map ordered parts to content:
    const parts = candidate.content?.parts ?? [];

    const usageMetadata = response.usageMetadata;

    // Associates a code execution result with its preceding call.
    let lastCodeExecutionToolCallId: string | undefined;

    // Build content array from all parts
    for (const part of parts) {
      if ('executableCode' in part && part.executableCode?.code) {
        const toolCallId = this.config.generateId();
        lastCodeExecutionToolCallId = toolCallId;

        content.push({
          type: 'tool-call',
          toolCallId,
          toolName: 'code_execution',
          input: JSON.stringify(part.executableCode),
          providerExecuted: true,
        });
      } else if ('codeExecutionResult' in part && part.codeExecutionResult) {
        content.push({
          type: 'tool-result',
          // Assumes a result directly follows its corresponding call part.
          toolCallId: lastCodeExecutionToolCallId!,
          toolName: 'code_execution',
          result: {
            outcome: part.codeExecutionResult.outcome,
            output: part.codeExecutionResult.output,
          },
        });
        // Clear the ID after use to avoid accidental reuse.
        lastCodeExecutionToolCallId = undefined;
      } else if ('text' in part && part.text != null && part.text.length > 0) {
        content.push({
          type: part.thought === true ? 'reasoning' : 'text',
          text: part.text,
          providerMetadata: part.thoughtSignature
            ? { google: { thoughtSignature: part.thoughtSignature } }
            : undefined,
        });
      } else if ('functionCall' in part) {
        content.push({
          type: 'tool-call' as const,
          toolCallId: this.config.generateId(),
          toolName: part.functionCall.name,
          input: JSON.stringify(part.functionCall.args),
          providerMetadata: part.thoughtSignature
            ? { google: { thoughtSignature: part.thoughtSignature } }
            : undefined,
        });
      } else if ('inlineData' in part) {
        content.push({
          type: 'file' as const,
          data: part.inlineData.data,
          mediaType: part.inlineData.mimeType,
        });
      }
    }

    const sources =
      extractSources({
        groundingMetadata: candidate.groundingMetadata,
        generateId: this.config.generateId,
      }) ?? [];
    for (const source of sources) {
      content.push(source);
    }

    return {
      content,
      finishReason: mapGoogleGenerativeAIFinishReason({
        finishReason: candidate.finishReason,
        hasToolCalls: content.some(part => part.type === 'tool-call'),
      }),
      usage: {
        inputTokens: usageMetadata?.promptTokenCount ?? undefined,
        outputTokens: usageMetadata?.candidatesTokenCount ?? undefined,
        totalTokens: usageMetadata?.totalTokenCount ?? undefined,
        reasoningTokens: usageMetadata?.thoughtsTokenCount ?? undefined,
        cachedInputTokens: usageMetadata?.cachedContentTokenCount ?? undefined,
      },
      warnings,
      providerMetadata: {
        google: {
          promptFeedback: response.promptFeedback ?? null,
          groundingMetadata: candidate.groundingMetadata ?? null,
          urlContextMetadata: candidate.urlContextMetadata ?? null,
          safetyRatings: candidate.safetyRatings ?? null,
          usageMetadata: usageMetadata ?? null,
        },
      },
      request: { body },
      response: {
        // TODO timestamp, model id, id
        headers: responseHeaders,
        body: rawResponse,
      },
    };
  }

  async doStream(
    options: Parameters<LanguageModelV3['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV3['doStream']>>> {
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

    let finishReason: LanguageModelV3FinishReason = 'unknown';
    const usage: LanguageModelV3Usage = {
      inputTokens: undefined,
      outputTokens: undefined,
      totalTokens: undefined,
    };
    let providerMetadata: SharedV3ProviderMetadata | undefined = undefined;

    const generateId = this.config.generateId;
    let hasToolCalls = false;

    // Track active blocks to group consecutive parts of same type
    let currentTextBlockId: string | null = null;
    let currentReasoningBlockId: string | null = null;
    let blockCounter = 0;

    // Track emitted sources to prevent duplicates
    const emittedSourceUrls = new Set<string>();
    // Associates a code execution result with its preceding call.
    let lastCodeExecutionToolCallId: string | undefined;

    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<ChunkSchema>,
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

            const value = chunk.value;

            const usageMetadata = value.usageMetadata;

            if (usageMetadata != null) {
              usage.inputTokens = usageMetadata.promptTokenCount ?? undefined;
              usage.outputTokens =
                usageMetadata.candidatesTokenCount ?? undefined;
              usage.totalTokens = usageMetadata.totalTokenCount ?? undefined;
              usage.reasoningTokens =
                usageMetadata.thoughtsTokenCount ?? undefined;
              usage.cachedInputTokens =
                usageMetadata.cachedContentTokenCount ?? undefined;
            }

            const candidate = value.candidates?.[0];

            // sometimes the API returns an empty candidates array
            if (candidate == null) {
              return;
            }

            const content = candidate.content;

            const sources = extractSources({
              groundingMetadata: candidate.groundingMetadata,
              generateId,
            });
            if (sources != null) {
              for (const source of sources) {
                if (
                  source.sourceType === 'url' &&
                  !emittedSourceUrls.has(source.url)
                ) {
                  emittedSourceUrls.add(source.url);
                  controller.enqueue(source);
                }
              }
            }

            // Process tool call's parts before determining finishReason to ensure hasToolCalls is properly set
            if (content != null) {
              // Process text parts individually to handle reasoning parts
              const parts = content.parts ?? [];
              for (const part of parts) {
                if ('executableCode' in part && part.executableCode?.code) {
                  const toolCallId = generateId();
                  lastCodeExecutionToolCallId = toolCallId;

                  controller.enqueue({
                    type: 'tool-call',
                    toolCallId,
                    toolName: 'code_execution',
                    input: JSON.stringify(part.executableCode),
                    providerExecuted: true,
                  });

                  hasToolCalls = true;
                } else if (
                  'codeExecutionResult' in part &&
                  part.codeExecutionResult
                ) {
                  // Assumes a result directly follows its corresponding call part.
                  const toolCallId = lastCodeExecutionToolCallId;

                  if (toolCallId) {
                    controller.enqueue({
                      type: 'tool-result',
                      toolCallId,
                      toolName: 'code_execution',
                      result: {
                        outcome: part.codeExecutionResult.outcome,
                        output: part.codeExecutionResult.output,
                      },
                    });
                    // Clear the ID after use.
                    lastCodeExecutionToolCallId = undefined;
                  }
                } else if (
                  'text' in part &&
                  part.text != null &&
                  part.text.length > 0
                ) {
                  if (part.thought === true) {
                    // End any active text block before starting reasoning
                    if (currentTextBlockId !== null) {
                      controller.enqueue({
                        type: 'text-end',
                        id: currentTextBlockId,
                      });
                      currentTextBlockId = null;
                    }

                    // Start new reasoning block if not already active
                    if (currentReasoningBlockId === null) {
                      currentReasoningBlockId = String(blockCounter++);
                      controller.enqueue({
                        type: 'reasoning-start',
                        id: currentReasoningBlockId,
                        providerMetadata: part.thoughtSignature
                          ? {
                              google: {
                                thoughtSignature: part.thoughtSignature,
                              },
                            }
                          : undefined,
                      });
                    }

                    controller.enqueue({
                      type: 'reasoning-delta',
                      id: currentReasoningBlockId,
                      delta: part.text,
                      providerMetadata: part.thoughtSignature
                        ? {
                            google: { thoughtSignature: part.thoughtSignature },
                          }
                        : undefined,
                    });
                  } else {
                    // End any active reasoning block before starting text
                    if (currentReasoningBlockId !== null) {
                      controller.enqueue({
                        type: 'reasoning-end',
                        id: currentReasoningBlockId,
                      });
                      currentReasoningBlockId = null;
                    }

                    // Start new text block if not already active
                    if (currentTextBlockId === null) {
                      currentTextBlockId = String(blockCounter++);
                      controller.enqueue({
                        type: 'text-start',
                        id: currentTextBlockId,
                        providerMetadata: part.thoughtSignature
                          ? {
                              google: {
                                thoughtSignature: part.thoughtSignature,
                              },
                            }
                          : undefined,
                      });
                    }

                    controller.enqueue({
                      type: 'text-delta',
                      id: currentTextBlockId,
                      delta: part.text,
                      providerMetadata: part.thoughtSignature
                        ? {
                            google: { thoughtSignature: part.thoughtSignature },
                          }
                        : undefined,
                    });
                  }
                }
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
                    type: 'tool-input-start',
                    id: toolCall.toolCallId,
                    toolName: toolCall.toolName,
                    providerMetadata: toolCall.providerMetadata,
                  });

                  controller.enqueue({
                    type: 'tool-input-delta',
                    id: toolCall.toolCallId,
                    delta: toolCall.args,
                    providerMetadata: toolCall.providerMetadata,
                  });

                  controller.enqueue({
                    type: 'tool-input-end',
                    id: toolCall.toolCallId,
                    providerMetadata: toolCall.providerMetadata,
                  });

                  controller.enqueue({
                    type: 'tool-call',
                    toolCallId: toolCall.toolCallId,
                    toolName: toolCall.toolName,
                    input: toolCall.args,
                    providerMetadata: toolCall.providerMetadata,
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

              providerMetadata = {
                google: {
                  promptFeedback: value.promptFeedback ?? null,
                  groundingMetadata: candidate.groundingMetadata ?? null,
                  urlContextMetadata: candidate.urlContextMetadata ?? null,
                  safetyRatings: candidate.safetyRatings ?? null,
                },
              };
              if (usageMetadata != null) {
                providerMetadata.google.usageMetadata = usageMetadata;
              }
            }
          },

          flush(controller) {
            // Close any open blocks before finishing
            if (currentTextBlockId !== null) {
              controller.enqueue({
                type: 'text-end',
                id: currentTextBlockId,
              });
            }
            if (currentReasoningBlockId !== null) {
              controller.enqueue({
                type: 'reasoning-end',
                id: currentReasoningBlockId,
              });
            }

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
      request: { body },
    };
  }
}

function getToolCallsFromParts({
  parts,
  generateId,
}: {
  parts: ContentSchema['parts'];
  generateId: () => string;
}) {
  const functionCallParts = parts?.filter(
    part => 'functionCall' in part,
  ) as Array<
    GoogleGenerativeAIContentPart & {
      functionCall: { name: string; args: unknown };
      thoughtSignature?: string | null;
    }
  >;

  return functionCallParts == null || functionCallParts.length === 0
    ? undefined
    : functionCallParts.map(part => ({
        type: 'tool-call' as const,
        toolCallId: generateId(),
        toolName: part.functionCall.name,
        args: JSON.stringify(part.functionCall.args),
        providerMetadata: part.thoughtSignature
          ? { google: { thoughtSignature: part.thoughtSignature } }
          : undefined,
      }));
}

function getInlineDataParts(parts: ContentSchema['parts']) {
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
  groundingMetadata: GroundingMetadataSchema | undefined | null;
  generateId: () => string;
}): undefined | LanguageModelV3Source[] {
  return groundingMetadata?.groundingChunks
    ?.filter(
      (
        chunk,
      ): chunk is GroundingChunkSchema & {
        web: { uri: string; title?: string };
      } => chunk.web != null,
    )
    .map(chunk => ({
      type: 'source',
      sourceType: 'url',
      id: generateId(),
      url: chunk.web.uri,
      title: chunk.web.title,
    }));
}

export const getGroundingMetadataSchema = () =>
  z.object({
    webSearchQueries: z.array(z.string()).nullish(),
    retrievalQueries: z.array(z.string()).nullish(),
    searchEntryPoint: z.object({ renderedContent: z.string() }).nullish(),
    groundingChunks: z
      .array(
        z.object({
          web: z
            .object({ uri: z.string(), title: z.string().nullish() })
            .nullish(),
          retrievedContext: z
            .object({ uri: z.string(), title: z.string().nullish() })
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

const getContentSchema = () =>
  z.object({
    parts: z
      .array(
        z.union([
          // note: order matters since text can be fully empty
          z.object({
            functionCall: z.object({
              name: z.string(),
              args: z.unknown(),
            }),
            thoughtSignature: z.string().nullish(),
          }),
          z.object({
            inlineData: z.object({
              mimeType: z.string(),
              data: z.string(),
            }),
          }),
          z.object({
            executableCode: z
              .object({
                language: z.string(),
                code: z.string(),
              })
              .nullish(),
            codeExecutionResult: z
              .object({
                outcome: z.string(),
                output: z.string(),
              })
              .nullish(),
            text: z.string().nullish(),
            thought: z.boolean().nullish(),
            thoughtSignature: z.string().nullish(),
          }),
        ]),
      )
      .nullish(),
  });

// https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/configure-safety-filters
const getSafetyRatingSchema = () =>
  z.object({
    category: z.string().nullish(),
    probability: z.string().nullish(),
    probabilityScore: z.number().nullish(),
    severity: z.string().nullish(),
    severityScore: z.number().nullish(),
    blocked: z.boolean().nullish(),
  });

const usageSchema = z.object({
  cachedContentTokenCount: z.number().nullish(),
  thoughtsTokenCount: z.number().nullish(),
  promptTokenCount: z.number().nullish(),
  candidatesTokenCount: z.number().nullish(),
  totalTokenCount: z.number().nullish(),
});

// https://ai.google.dev/api/generate-content#UrlRetrievalMetadata
export const getUrlContextMetadataSchema = () =>
  z.object({
    urlMetadata: z.array(
      z.object({
        retrievedUrl: z.string(),
        urlRetrievalStatus: z.string(),
      }),
    ),
  });

const responseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      candidates: z.array(
        z.object({
          content: getContentSchema().nullish().or(z.object({}).strict()),
          finishReason: z.string().nullish(),
          safetyRatings: z.array(getSafetyRatingSchema()).nullish(),
          groundingMetadata: getGroundingMetadataSchema().nullish(),
          urlContextMetadata: getUrlContextMetadataSchema().nullish(),
        }),
      ),
      usageMetadata: usageSchema.nullish(),
      promptFeedback: z
        .object({
          blockReason: z.string().nullish(),
          safetyRatings: z.array(getSafetyRatingSchema()).nullish(),
        })
        .nullish(),
    }),
  ),
);

type ContentSchema = NonNullable<
  InferSchema<typeof responseSchema>['candidates'][number]['content']
>;
export type GroundingMetadataSchema = NonNullable<
  InferSchema<typeof responseSchema>['candidates'][number]['groundingMetadata']
>;

type GroundingChunkSchema = NonNullable<
  GroundingMetadataSchema['groundingChunks']
>[number];

export type UrlContextMetadataSchema = NonNullable<
  InferSchema<typeof responseSchema>['candidates'][number]['urlContextMetadata']
>;

export type SafetyRatingSchema = NonNullable<
  InferSchema<typeof responseSchema>['candidates'][number]['safetyRatings']
>[number];

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const chunkSchema = lazySchema(() =>
  zodSchema(
    z.object({
      candidates: z
        .array(
          z.object({
            content: getContentSchema().nullish(),
            finishReason: z.string().nullish(),
            safetyRatings: z.array(getSafetyRatingSchema()).nullish(),
            groundingMetadata: getGroundingMetadataSchema().nullish(),
            urlContextMetadata: getUrlContextMetadataSchema().nullish(),
          }),
        )
        .nullish(),
      usageMetadata: usageSchema.nullish(),
      promptFeedback: z
        .object({
          blockReason: z.string().nullish(),
          safetyRatings: z.array(getSafetyRatingSchema()).nullish(),
        })
        .nullish(),
    }),
  ),
);

type ChunkSchema = InferSchema<typeof chunkSchema>;
