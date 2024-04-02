import { z } from 'zod';
import {
  LanguageModelV1,
  LanguageModelV1CallWarning,
  LanguageModelV1FinishReason,
  LanguageModelV1StreamPart,
  ParseResult,
  UnsupportedFunctionalityError,
  createEventSourceResponseHandler,
  createJsonResponseHandler,
  postJsonToApi,
} from '../spec';
import { convertToGoogleGenerativeAIMessages } from './convert-to-google-generative-ai-messages';
import { googleFailedResponseHandler } from './google-error';
import { GoogleGenerativeAIContentPart } from './google-generative-ai-prompt';
import {
  GoogleGenerativeAIModelId,
  GoogleGenerativeAISettings,
} from './google-generative-ai-settings';

type GoogleGenerativeAIConfig = {
  provider: string;
  baseUrl: string;
  headers: () => Record<string, string | undefined>;
  generateId: () => string;
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

  private getArgs({
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

    const baseArgs = {
      // model id:
      model: this.modelId,

      // model specific settings:
      // TODO

      // standardized settings:
      // max_tokens: maxTokens,
      // temperature, // uses 0..1 scale
      // top_p: topP,
      // random_seed: seed,

      // messages:
      contents: convertToGoogleGenerativeAIMessages({
        provider: this.provider,
        prompt,
      }),
    };

    switch (type) {
      case 'regular': {
        const functionDeclarations = mode.tools?.map(tool => ({
          name: tool.name,
          description: tool.description ?? '',
          parameters: prepareJsonSchema(tool.parameters),
        }));

        return {
          args: {
            ...baseArgs,
            tools:
              functionDeclarations == null
                ? undefined
                : { functionDeclarations },
          },
          warnings,
        };
      }

      case 'object-json': {
        throw new UnsupportedFunctionalityError({
          functionality: 'object-json mode',
          provider: this.provider,
        });
      }

      case 'object-tool': {
        throw new UnsupportedFunctionalityError({
          functionality: 'object-tool mode',
          provider: this.provider,
        });
      }

      case 'object-grammar': {
        throw new UnsupportedFunctionalityError({
          functionality: 'object-grammar mode',
          provider: this.provider,
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
    const { args, warnings } = this.getArgs(options);

    const response = await postJsonToApi({
      url: `${this.config.baseUrl}/${this.modelId}:generateContent`,
      headers: this.config.headers(),
      body: args,
      failedResponseHandler: googleFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(responseSchema),
      abortSignal: options.abortSignal,
    });

    const { contents: rawPrompt, ...rawSettings } = args;
    const candidate = response.candidates[0];

    return {
      text: getTextFromParts(candidate.content.parts),
      toolCalls: getToolCallsFromParts({
        parts: candidate.content.parts,
        generateId: this.config.generateId,
      }),
      // finishReason: mapMistralFinishReason(candidate.finish_reason),
      finishReason: 'stop',
      usage: {
        promptTokens: 1, // TODO response.usage.prompt_tokens,
        completionTokens: 1, // TODO response.usage.completion_tokens,
      },
      rawCall: { rawPrompt, rawSettings },
      warnings,
    };
  }

  async doStream(
    options: Parameters<LanguageModelV1['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV1['doStream']>>> {
    const { args, warnings } = this.getArgs(options);

    const response = await postJsonToApi({
      url: `${this.config.baseUrl}/${this.modelId}:streamGenerateContent?alt=sse`,
      headers: this.config.headers(),
      body: args,
      failedResponseHandler: googleFailedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(chunkSchema),
      abortSignal: options.abortSignal,
    });

    const { contents: rawPrompt, ...rawSettings } = args;

    let finishReason: LanguageModelV1FinishReason = 'other';
    let usage: { promptTokens: number; completionTokens: number } = {
      promptTokens: Number.NaN,
      completionTokens: Number.NaN,
    };

    const generateId = this.config.generateId;

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

            // if (value.usage != null) {
            //   usage = {
            //     promptTokens: value.usage.prompt_tokens,
            //     completionTokens: value.usage.completion_tokens,
            //   };
            // }

            const candidate = value.candidates[0];

            // if (candidate?.finish_reason != null) {
            //   finishReason = mapMistralFinishReason(candidate.finish_reason);
            // }

            // if (candidate?.delta == null) {
            //   return;
            // }

            // const delta = candidate.delta;

            console.log(JSON.stringify(candidate, null, 2));

            const deltaText = getTextFromParts(candidate.content.parts);
            if (deltaText != null) {
              controller.enqueue({
                type: 'text-delta',
                textDelta: deltaText,
              });
            }

            // if (delta.tool_calls != null) {
            //   for (const toolCall of delta.tool_calls) {
            //     // mistral tool calls come in one piece

            //     controller.enqueue({
            //       type: 'tool-call-delta',
            //       toolCallType: 'function',
            //       toolCallId: generateId(),
            //       toolName: toolCall.function.name,
            //       argsTextDelta: toolCall.function.arguments,
            //     });

            //     controller.enqueue({
            //       type: 'tool-call',
            //       toolCallType: 'function',
            //       toolCallId: generateId(),
            //       toolName: toolCall.function.name,
            //       args: toolCall.function.arguments,
            //     });
            //   }
            // }
          },

          flush(controller) {
            controller.enqueue({ type: 'finish', finishReason, usage });
          },
        }),
      ),
      rawCall: { rawPrompt, rawSettings },
      warnings,
    };
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
  candidates: z.array(z.object({ content: contentSchema })),
});

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const chunkSchema = z.object({
  candidates: z.array(z.object({ content: contentSchema })),
});
