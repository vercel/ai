import {
  LanguageModelV1,
  LanguageModelV1CallOptions,
  LanguageModelV1CallWarning,
  LanguageModelV1FinishReason,
  LanguageModelV1StreamPart,
  NoContentGeneratedError,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { convertAsyncGeneratorToReadableStream } from '@ai-sdk/provider-utils';
import {
  GenerateContentResponse,
  GenerationConfig,
  Part,
  SafetySetting,
  VertexAI,
} from '@google-cloud/vertexai';
import { convertToGoogleVertexContentRequest } from './convert-to-google-vertex-content-request';
import {
  GoogleVertexModelId,
  GoogleVertexSettings,
} from './google-vertex-settings';
import { mapGoogleVertexFinishReason } from './map-google-vertex-finish-reason';
import { prepareFunctionDeclarationSchema } from './prepare-function-declaration-schema';

type GoogleVertexAIConfig = {
  vertexAI: VertexAI;
  generateId: () => string;
};

export class GoogleVertexLanguageModel implements LanguageModelV1 {
  readonly specificationVersion = 'v1';
  readonly provider = 'google-vertex';
  readonly defaultObjectGenerationMode = undefined;

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
    prompt,
    mode,
    frequencyPenalty,
    presencePenalty,
    seed,
    maxTokens,
    temperature,
    topP,
  }: LanguageModelV1CallOptions) {
    const warnings: LanguageModelV1CallWarning[] = [];

    if (frequencyPenalty != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'frequencyPenalty',
      });
    }

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

    const generationConfig: GenerationConfig = {
      // model specific settings:
      topK: this.settings.topK,

      // standardized settings:
      maxOutputTokens: maxTokens,
      temperature,
      topP,
    };

    const type = mode.type;

    switch (type) {
      case 'regular': {
        return {
          model: this.config.vertexAI.getGenerativeModel({
            model: this.modelId,
            generationConfig,
            tools: prepareTools(mode),
            safetySettings: this.settings.safetySettings as
              | undefined
              | Array<SafetySetting>,
          }),
          contentRequest: await convertToGoogleVertexContentRequest({ prompt }),
          warnings,
        };
      }

      case 'object-json': {
        throw new UnsupportedFunctionalityError({
          functionality: 'object-json mode',
        });
      }

      case 'object-tool': {
        throw new UnsupportedFunctionalityError({
          functionality: 'object-tool mode',
        });
      }

      case 'object-grammar': {
        throw new UnsupportedFunctionalityError({
          functionality: 'object-grammar mode',
        });
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

    let finishReason: LanguageModelV1FinishReason = 'other';
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
                controller.enqueue({
                  type: 'error',
                  error: new NoContentGeneratedError({
                    message: 'No candidates in chunk.',
                  }),
                });
                return;
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

function prepareTools(
  mode: Parameters<LanguageModelV1['doGenerate']>[0]['mode'] & {
    type: 'regular';
  },
) {
  // when the tools array is empty, change it to undefined to prevent errors:
  const tools = mode.tools?.length ? mode.tools : undefined;

  if (tools == null) {
    return undefined;
  }

  const toolChoice = mode.toolChoice;

  if (toolChoice?.type === 'none') {
    return undefined;
  }

  if (toolChoice == null || toolChoice.type === 'auto') {
    return [
      {
        functionDeclarations: tools.map(tool => ({
          name: tool.name,
          description: tool.description ?? '',
          parameters: prepareFunctionDeclarationSchema(tool.parameters),
        })),
      },
    ];
  }

  // forcing tool calls or a specific tool call is not supported by Vertex:
  throw new UnsupportedFunctionalityError({
    functionality: `toolChoice: ${toolChoice.type}`,
  });
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
