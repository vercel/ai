import {
  LanguageModelV1,
  LanguageModelV1CallWarning,
  LanguageModelV1FinishReason,
  NoTextGeneratedError,
} from '@ai-sdk/provider';
import { safeParseJSON } from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { TokenUsage, calculateTokenUsage } from '../generate-text/token-usage';
import { CallSettings } from '../prompt/call-settings';
import { convertToLanguageModelPrompt } from '../prompt/convert-to-language-model-prompt';
import { getValidatedPrompt } from '../prompt/get-validated-prompt';
import { prepareCallSettings } from '../prompt/prepare-call-settings';
import { Prompt } from '../prompt/prompt';
import { convertZodToJSONSchema } from '../util/convert-zod-to-json-schema';
import { retryWithExponentialBackoff } from '../util/retry-with-exponential-backoff';
import { injectJsonSchemaIntoSystem } from './inject-json-schema-into-system';

/**
Generate a structured, typed object for a given prompt and schema using a language model.

This function does not stream the output. If you want to stream the output, use `experimental_streamObject` instead.

@param model - The language model to use.

@param schema - The schema of the object that the model should generate.
@param mode - The mode to use for object generation. Not all models support all modes. Defaults to 'auto'.

@param system - A system message that will be part of the prompt.
@param prompt - A simple text prompt. You can either use `prompt` or `messages` but not both.
@param messages - A list of messages. You can either use `prompt` or `messages` but not both.

@param maxTokens - Maximum number of tokens to generate.
@param temperature - Temperature setting. 
This is a number between 0 (almost no randomness) and 1 (very random).
It is recommended to set either `temperature` or `topP`, but not both.
@param topP - Nucleus sampling. This is a number between 0 and 1.
E.g. 0.1 would mean that only tokens with the top 10% probability mass are considered.
It is recommended to set either `temperature` or `topP`, but not both.
@param presencePenalty - Presence penalty setting. 
It affects the likelihood of the model to repeat information that is already in the prompt.
The presence penalty is a number between -1 (increase repetition) and 1 (maximum penalty, decrease repetition). 
0 means no penalty.
@param frequencyPenalty - Frequency penalty setting.
It affects the likelihood of the model to repeatedly use the same words or phrases.
The frequency penalty is a number between -1 (increase repetition) and 1 (maximum penalty, decrease repetition).
0 means no penalty.
@param seed - The seed (integer) to use for random sampling.
If set and supported by the model, calls will generate deterministic results.

@param maxRetries - Maximum number of retries. Set to 0 to disable retries. Default: 2.
@param abortSignal - An optional abort signal that can be used to cancel the call.

@returns 
A result object that contains the generated object, the finish reason, the token usage, and additional information.
 */
export async function experimental_generateObject<T>({
  model,
  schema,
  mode,
  system,
  prompt,
  messages,
  maxRetries,
  abortSignal,
  ...settings
}: CallSettings &
  Prompt & {
    /**
The language model to use.
     */
    model: LanguageModelV1;

    /**
The schema of the object that the model should generate.
     */
    schema: z.Schema<T>;

    /**
The mode to use for object generation. Not all models support all modes.

Default and recommended: 'auto' (best mode for the model).
     */
    mode?: 'auto' | 'json' | 'tool' | 'grammar';
  }): Promise<GenerateObjectResult<T>> {
  const retry = retryWithExponentialBackoff({ maxRetries });
  const jsonSchema = convertZodToJSONSchema(schema);

  // use the default provider mode when the mode is set to 'auto' or unspecified
  if (mode === 'auto' || mode == null) {
    mode = model.defaultObjectGenerationMode;
  }

  let result: string;
  let finishReason: LanguageModelV1FinishReason;
  let usage: Parameters<typeof calculateTokenUsage>[0];
  let warnings: LanguageModelV1CallWarning[] | undefined;

  switch (mode) {
    case 'json': {
      const validatedPrompt = getValidatedPrompt({
        system: injectJsonSchemaIntoSystem({ system, schema: jsonSchema }),
        prompt,
        messages,
      });

      const generateResult = await retry(() => {
        return model.doGenerate({
          mode: { type: 'object-json' },
          ...prepareCallSettings(settings),
          inputFormat: validatedPrompt.type,
          prompt: convertToLanguageModelPrompt(validatedPrompt),
          abortSignal,
        });
      });

      if (generateResult.text === undefined) {
        throw new NoTextGeneratedError();
      }

      result = generateResult.text;
      finishReason = generateResult.finishReason;
      usage = generateResult.usage;
      warnings = generateResult.warnings;

      break;
    }

    case 'grammar': {
      const validatedPrompt = getValidatedPrompt({
        system: injectJsonSchemaIntoSystem({ system, schema: jsonSchema }),
        prompt,
        messages,
      });

      const generateResult = await retry(() =>
        model.doGenerate({
          mode: { type: 'object-grammar', schema: jsonSchema },
          ...settings,
          inputFormat: validatedPrompt.type,
          prompt: convertToLanguageModelPrompt(validatedPrompt),
          abortSignal,
        }),
      );

      if (generateResult.text === undefined) {
        throw new NoTextGeneratedError();
      }

      result = generateResult.text;
      finishReason = generateResult.finishReason;
      usage = generateResult.usage;
      warnings = generateResult.warnings;

      break;
    }

    case 'tool': {
      const validatedPrompt = getValidatedPrompt({
        system,
        prompt,
        messages,
      });

      const generateResult = await retry(() =>
        model.doGenerate({
          mode: {
            type: 'object-tool',
            tool: {
              type: 'function',
              name: 'json',
              description: 'Respond with a JSON object.',
              parameters: jsonSchema,
            },
          },
          ...settings,
          inputFormat: validatedPrompt.type,
          prompt: convertToLanguageModelPrompt(validatedPrompt),
          abortSignal,
        }),
      );

      const functionArgs = generateResult.toolCalls?.[0]?.args;

      if (functionArgs === undefined) {
        throw new NoTextGeneratedError();
      }

      result = functionArgs;
      finishReason = generateResult.finishReason;
      usage = generateResult.usage;
      warnings = generateResult.warnings;

      break;
    }

    case undefined: {
      throw new Error('Model does not have a default object generation mode.');
    }

    default: {
      const _exhaustiveCheck: never = mode;
      throw new Error(`Unsupported mode: ${_exhaustiveCheck}`);
    }
  }

  const parseResult = safeParseJSON({ text: result, schema });

  if (!parseResult.success) {
    throw parseResult.error;
  }

  return new GenerateObjectResult({
    object: parseResult.value,
    finishReason,
    usage: calculateTokenUsage(usage),
    warnings,
  });
}

/**
The result of a `generateObject` call.
 */
export class GenerateObjectResult<T> {
  /**
The generated object (typed according to the schema).
   */
  readonly object: T;

  /**
The reason why the generation finished.
   */
  readonly finishReason: LanguageModelV1FinishReason;

  /**
The token usage of the generated text.
   */
  readonly usage: TokenUsage;

  /**
Warnings from the model provider (e.g. unsupported settings)
   */
  readonly warnings: LanguageModelV1CallWarning[] | undefined;

  constructor(options: {
    object: T;
    finishReason: LanguageModelV1FinishReason;
    usage: TokenUsage;
    warnings: LanguageModelV1CallWarning[] | undefined;
  }) {
    this.object = options.object;
    this.finishReason = options.finishReason;
    this.usage = options.usage;
    this.warnings = options.warnings;
  }
}
