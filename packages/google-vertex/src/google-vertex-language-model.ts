import {
  LanguageModelV1,
  LanguageModelV1CallOptions,
  LanguageModelV1CallWarning,
  LanguageModelV1FinishReason,
  LanguageModelV1StreamPart,
  NoContentGeneratedError,
} from '@ai-sdk/provider';
import { convertAsyncGeneratorToReadableStream } from '@ai-sdk/provider-utils';
import {
  FunctionCallingMode,
  FunctionDeclarationSchema,
  GenerateContentResponse,
  GenerationConfig,
  Part,
  ResponseSchema,
  SafetySetting,
  Tool,
  ToolConfig,
  VertexAI,
} from '@google-cloud/vertexai';
import { convertJSONSchemaToOpenAPISchema } from './convert-json-schema-to-openapi-schema';
import { convertToGoogleVertexContentRequest } from './convert-to-google-vertex-content-request';
import {
  GoogleVertexModelId,
  GoogleVertexSettings,
} from './google-vertex-settings';
import { mapGoogleVertexFinishReason } from './map-google-vertex-finish-reason';
type GoogleVertexAIConfig = {
  vertexAI: VertexAI;
  generateId: () => string;
};

export class GoogleVertexLanguageModel implements LanguageModelV1 {
  readonly specificationVersion = 'v1';
  readonly provider = 'google-vertex';
  readonly defaultObjectGenerationMode = 'json';
  readonly supportsImageUrls = false;

  get supportsObjectGeneration() {
    return this.settings.structuredOutputs !== false;
  }

  readonly modelId: GoogleVertexModelId;
  readonly settings: GoogleVertexSettings;

  private readonly config: GoogleVertexAIConfig;

  constructor(
    modelId: GoogleVertexModelId,
    settings: GoogleVertexSettings,
    config: GoogleVertexAIConfig,
  ) {
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
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
    headers,
  }: LanguageModelV1CallOptions) {
    const warnings: LanguageModelV1CallWarning[] = [];

    if (presencePenalty != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'presencePenalty',
      });
    }

    if (seed != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'seed',
      });
    }

    if (headers != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'headers',
      });
    }

    const generationConfig: GenerationConfig = {
      // model specific settings:
      topK: topK ?? this.settings.topK,

      // standardized settings:
      maxOutputTokens: maxTokens,
      frequencyPenalty,
      temperature,
      topP,
      stopSequences,

      // response format:
      responseMimeType:
        responseFormat?.type === 'json' ? 'application/json' : undefined,
      responseSchema:
        responseFormat?.type === 'json' &&
        responseFormat.schema != null &&
        // Google Vertex does not support all OpenAPI Schema features,
        // so this is needed as an escape hatch:
        this.supportsObjectGeneration
          ? (convertJSONSchemaToOpenAPISchema(
              responseFormat.schema,
            ) as ResponseSchema)
          : undefined,
    };

    const type = mode.type;

    switch (type) {
      case 'regular': {
        const configuration = {
          model: this.modelId,
          generationConfig,
          ...prepareToolsAndToolConfig({
            mode,
            useSearchGrounding: this.settings.useSearchGrounding ?? false,
          }),
          safetySettings: this.settings.safetySettings as
            | undefined
            | Array<SafetySetting>,
        };

        return {
          model: this.config.vertexAI.getGenerativeModel(configuration),
          contentRequest: convertToGoogleVertexContentRequest(prompt),
          warnings,
        };
      }

      case 'object-json': {
        return {
          model: this.config.vertexAI.getGenerativeModel({
            model: this.modelId,
            generationConfig: {
              ...generationConfig,
              responseMimeType: 'application/json',
              responseSchema:
                mode.schema != null &&
                // Google Vertex does not support all OpenAPI Schema features,
                // so this is needed as an escape hatch:
                this.supportsObjectGeneration
                  ? (convertJSONSchemaToOpenAPISchema(
                      mode.schema,
                    ) as ResponseSchema)
                  : undefined,
            },
            safetySettings: this.settings.safetySettings as
              | undefined
              | Array<SafetySetting>,
          }),
          contentRequest: convertToGoogleVertexContentRequest(prompt),
          warnings,
        };
      }

      case 'object-tool': {
        const configuration = {
          model: this.modelId,
          generationConfig,
          tools: [
            {
              functionDeclarations: [
                {
                  name: mode.tool.name,
                  description: mode.tool.description ?? '',
                  parameters: convertJSONSchemaToOpenAPISchema(
                    mode.tool.parameters,
                  ) as FunctionDeclarationSchema,
                },
              ],
            },
          ],
          toolConfig: {
            functionCallingConfig: { mode: FunctionCallingMode.ANY },
          },
          safetySettings: this.settings.safetySettings as
            | undefined
            | Array<SafetySetting>,
        };

        return {
          model: this.config.vertexAI.getGenerativeModel(configuration),
          contentRequest: convertToGoogleVertexContentRequest(prompt),
          warnings,
        };
      }

      default: {
        const _exhaustiveCheck: never = type;
        throw new Error(`Unsupported type: ${_exhaustiveCheck}`);
      }
    }
  }

  async doGenerate(
    options: Parameters<LanguageModelV1['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV1['doGenerate']>>> {
    const { model, contentRequest, warnings } = await this.getArgs(options);
    const { response } = await model.generateContent(contentRequest);

    const firstCandidate = response.candidates?.[0];

    if (firstCandidate == null) {
      throw new NoContentGeneratedError({ message: 'No candidates returned' });
    }

    const parts = firstCandidate.content.parts;
    const usageMetadata = response.usageMetadata;

    const toolCalls = getToolCallsFromParts({
      parts,
      generateId: this.config.generateId,
    });

    return {
      text: getTextFromParts(parts),
      toolCalls,
      finishReason: mapGoogleVertexFinishReason({
        finishReason: firstCandidate.finishReason,
        hasToolCalls: toolCalls != null && toolCalls.length > 0,
      }),
      usage: {
        promptTokens: usageMetadata?.promptTokenCount ?? NaN,
        completionTokens: usageMetadata?.candidatesTokenCount ?? NaN,
      },
      rawCall: {
        rawPrompt: contentRequest,
        rawSettings: {},
      },
      warnings,
    };
  }

  async doStream(
    options: Parameters<LanguageModelV1['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV1['doStream']>>> {
    const { model, contentRequest, warnings } = await this.getArgs(options);
    const { stream } = await model.generateContentStream(contentRequest);

    let finishReason: LanguageModelV1FinishReason = 'unknown';
    let usage: { promptTokens: number; completionTokens: number } = {
      promptTokens: Number.NaN,
      completionTokens: Number.NaN,
    };

    const generateId = this.config.generateId;
    let hasToolCalls = false;

    return {
      stream: convertAsyncGeneratorToReadableStream(stream).pipeThrough(
        new TransformStream<GenerateContentResponse, LanguageModelV1StreamPart>(
          {
            transform(chunk, controller) {
              const usageMetadata = chunk.usageMetadata;
              if (usageMetadata != null) {
                usage = {
                  promptTokens: usageMetadata.promptTokenCount ?? NaN,
                  completionTokens: usageMetadata.candidatesTokenCount ?? NaN,
                };
              }

              const candidate = chunk.candidates?.[0];

              if (candidate == null) {
                return; // ignored (this can happen when using grounding)
              }

              if (candidate.finishReason != null) {
                finishReason = mapGoogleVertexFinishReason({
                  finishReason: candidate.finishReason,
                  hasToolCalls,
                });
              }

              const content = candidate.content;

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
              });
            },
          },
        ),
      ),
      rawCall: {
        rawPrompt: contentRequest,
        rawSettings: {},
      },
      warnings,
    };
  }
}

function prepareToolsAndToolConfig({
  useSearchGrounding,
  mode,
}: {
  useSearchGrounding: boolean;
  mode: Parameters<LanguageModelV1['doGenerate']>[0]['mode'] & {
    type: 'regular';
  };
}): {
  tools: Tool[] | undefined;
  toolConfig: ToolConfig | undefined;
} {
  // when the tools array is empty, change it to undefined to prevent errors:
  const tools = mode.tools?.length ? mode.tools : undefined;

  const mappedTools: Tool[] =
    tools == null
      ? []
      : [
          {
            functionDeclarations: tools.map(tool => ({
              name: tool.name,
              description: tool.description ?? '',
              parameters: convertJSONSchemaToOpenAPISchema(
                tool.parameters,
              ) as FunctionDeclarationSchema,
            })),
          },
        ];

  if (useSearchGrounding) {
    mappedTools.push({ googleSearchRetrieval: {} });
  }

  const finalTools = mappedTools.length > 0 ? mappedTools : undefined;

  const toolChoice = mode.toolChoice;

  if (toolChoice == null) {
    return {
      tools: finalTools,
      toolConfig: undefined,
    };
  }

  const type = toolChoice.type;

  switch (type) {
    case 'auto':
      return {
        tools: finalTools,
        toolConfig: {
          functionCallingConfig: { mode: FunctionCallingMode.AUTO },
        },
      };
    case 'none':
      return {
        tools: finalTools,
        toolConfig: {
          functionCallingConfig: { mode: FunctionCallingMode.NONE },
        },
      };
    case 'required':
      return {
        tools: finalTools,
        toolConfig: {
          functionCallingConfig: { mode: FunctionCallingMode.ANY },
        },
      };
    case 'tool':
      return {
        tools: finalTools,
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingMode.ANY,
            allowedFunctionNames: [toolChoice.toolName],
          },
        },
      };
    default: {
      const _exhaustiveCheck: never = type;
      throw new Error(`Unsupported tool choice type: ${_exhaustiveCheck}`);
    }
  }
}

function getToolCallsFromParts({
  parts,
  generateId,
}: {
  parts: Part[];
  generateId: () => string;
}) {
  if (parts == null) {
    return undefined; // parts are sometimes undefined when using safety settings
  }

  return parts.flatMap(part =>
    part.functionCall == null
      ? []
      : {
          toolCallType: 'function' as const,
          toolCallId: generateId(),
          toolName: part.functionCall.name,
          args: JSON.stringify(part.functionCall.args),
        },
  );
}

function getTextFromParts(parts: Part[] | undefined) {
  if (parts == null) {
    return undefined; // parts are sometimes undefined when using safety settings
  }

  const textParts = parts.filter(part => 'text' in part) as Array<
    Part & { text: string }
  >;

  return textParts.length === 0
    ? undefined
    : textParts.map(part => part.text).join('');
}
