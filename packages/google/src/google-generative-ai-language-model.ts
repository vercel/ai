import {
  LanguageModelV1,
  LanguageModelV1CallWarning,
  LanguageModelV1FinishReason,
  LanguageModelV1StreamPart,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import {
  ParseResult,
  createEventSourceResponseHandler,
  createJsonResponseHandler,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { convertToGoogleGenerativeAIMessages } from './convert-to-google-generative-ai-messages';
import { googleFailedResponseHandler } from './google-error';
import { GoogleGenerativeAIContentPart } from './google-generative-ai-prompt';
import {
  GoogleGenerativeAIModelId,
  GoogleGenerativeAISettings,
} from './google-generative-ai-settings';
import { mapGoogleGenerativeAIFinishReason } from './map-google-generative-ai-finish-reason';

type GoogleGenerativeAIConfig = {
  provider: string;
  baseURL: string;
  headers: () => Record<string, string | undefined>;
  generateId: () => string;
  fetch?: typeof fetch;
};

export class GoogleGenerativeAILanguageModel implements LanguageModelV1 {
  readonly specificationVersion = 'v1';
  readonly defaultObjectGenerationMode = 'json';

  readonly modelId: GoogleGenerativeAIModelId;
  readonly settings: GoogleGenerativeAISettings;

  private readonly config: GoogleGenerativeAIConfig;

  constructor(
    modelId: GoogleGenerativeAIModelId,
    settings: GoogleGenerativeAISettings,
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
    frequencyPenalty,
    presencePenalty,
    seed,
  }: Parameters<LanguageModelV1['doGenerate']>[0]) {
    const type = mode.type;

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

    const generationConfig = {
      // model specific settings:
      topK: this.settings.topK,

      // standardized settings:
      maxOutputTokens: maxTokens,
      temperature,
      topP,
    };

    const contents = await convertToGoogleGenerativeAIMessages({ prompt });

    switch (type) {
      case 'regular': {
        return {
          args: {
            generationConfig,
            contents,
            safetySettings: this.settings.safetySettings,
            ...prepareToolsAndToolConfig(mode),
          },
          warnings,
        };
      }

      case 'object-json': {
        return {
          args: {
            generationConfig: {
              ...generationConfig,
              response_mime_type: 'application/json',
            },
            contents,
            safetySettings: this.settings.safetySettings,
          },
          warnings,
        };
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
    const { args, warnings } = await this.getArgs(options);

    const { responseHeaders, value: response } = await postJsonToApi({
      url: `${this.config.baseURL}/${this.modelId}:generateContent`,
      headers: this.config.headers(),
      body: args,
      failedResponseHandler: googleFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(responseSchema),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const { contents: rawPrompt, ...rawSettings } = args;
    const candidate = response.candidates[0];

    const toolCalls = getToolCallsFromParts({
      parts: candidate.content.parts,
      generateId: this.config.generateId,
    });

    const usageMetadata = response.usageMetadata;

    return {
      text: getTextFromParts(candidate.content.parts),
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
    };
  }

  async doStream(
    options: Parameters<LanguageModelV1['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV1['doStream']>>> {
    const { args, warnings } = await this.getArgs(options);

    const { responseHeaders, value: response } = await postJsonToApi({
      url: `${this.config.baseURL}/${this.modelId}:streamGenerateContent?alt=sse`,
      headers: this.config.headers(),
      body: args,
      failedResponseHandler: googleFailedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(chunkSchema),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const { contents: rawPrompt, ...rawSettings } = args;

    let finishReason: LanguageModelV1FinishReason = 'other';
    let usage: { promptTokens: number; completionTokens: number } = {
      promptTokens: Number.NaN,
      completionTokens: Number.NaN,
    };

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

            const candidate = value.candidates[0];

            if (candidate?.finishReason != null) {
              finishReason = mapGoogleGenerativeAIFinishReason({
                finishReason: candidate.finishReason,
                hasToolCalls,
              });
            }

            const usageMetadata = value.usageMetadata;

            if (usageMetadata != null) {
              usage = {
                promptTokens: usageMetadata.promptTokenCount ?? NaN,
                completionTokens: usageMetadata.candidatesTokenCount ?? NaN,
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
            controller.enqueue({ type: 'finish', finishReason, usage });
          },
        }),
      ),
      rawCall: { rawPrompt, rawSettings },
      rawResponse: { headers: responseHeaders },
      warnings,
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

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const responseSchema = z.object({
  candidates: z.array(
    z.object({
      content: contentSchema,
      finishReason: z.string().optional(),
    }),
  ),
  usageMetadata: z
    .object({
      promptTokenCount: z.number(),
      candidatesTokenCount: z.number(),
      totalTokenCount: z.number(),
    })
    .optional(),
});

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const chunkSchema = z.object({
  candidates: z.array(
    z.object({
      content: contentSchema.optional(),
      finishReason: z.string().optional(),
    }),
  ),
  usageMetadata: z
    .object({
      promptTokenCount: z.number(),
      candidatesTokenCount: z.number(),
      totalTokenCount: z.number(),
    })
    .optional(),
});

function prepareToolsAndToolConfig(
  mode: Parameters<LanguageModelV1['doGenerate']>[0]['mode'] & {
    type: 'regular';
  },
) {
  // when the tools array is empty, change it to undefined to prevent errors:
  const tools = mode.tools?.length ? mode.tools : undefined;

  if (tools == null) {
    return { tools: undefined, toolConfig: undefined };
  }

  const mappedTools = {
    functionDeclarations: tools.map(tool => ({
      name: tool.name,
      description: tool.description ?? '',
      parameters: prepareJsonSchema(tool.parameters),
    })),
  };

  const toolChoice = mode.toolChoice;

  if (toolChoice == null) {
    return { tools: mappedTools, toolConfig: undefined };
  }

  const type = toolChoice.type;

  switch (type) {
    case 'auto':
      return {
        tools: mappedTools,
        toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
      };
    case 'none':
      return {
        tools: mappedTools,
        toolConfig: { functionCallingConfig: { mode: 'NONE' } },
      };
    case 'required':
      return {
        tools: mappedTools,
        toolConfig: { functionCallingConfig: { mode: 'ANY' } },
      };
    case 'tool':
      return {
        tools: mappedTools,
        toolConfig: {
          functionCallingConfig: {
            mode: 'ANY',
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

// Removes all "additionalProperty" and "$schema" properties from the object (recursively)
// (not supported by Google Generative AI)
function prepareJsonSchema(jsonSchema: any): unknown {
  if (typeof jsonSchema !== 'object') {
    return jsonSchema;
  }

  if (Array.isArray(jsonSchema)) {
    return jsonSchema.map(prepareJsonSchema);
  }

  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(jsonSchema)) {
    if (key === 'additionalProperties' || key === '$schema') {
      continue;
    }

    result[key] = prepareJsonSchema(value);
  }

  return result;
}
