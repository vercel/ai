import { z } from 'zod';
import zodToJsonSchema from 'zod-to-json-schema';
import {
  LanguageModelV1,
  LanguageModelV1FinishReason,
  NoTextGeneratedError,
  safeParseJSON,
} from '../../ai-model-specification';
import { TokenUsage, calculateTokenUsage } from '../generate-text/token-usage';
import { CallSettings } from '../prompt/call-settings';
import { convertToLanguageModelPrompt } from '../prompt/convert-to-language-model-prompt';
import { getInputFormat } from '../prompt/get-input-format';
import { prepareCallSettings } from '../prompt/prepare-call-settings';
import { Prompt } from '../prompt/prompt';
import { retryWithExponentialBackoff } from '../util/retry-with-exponential-backoff';
import { injectJsonSchemaIntoSystem } from './inject-json-schema-into-system';

/**
 * Generate a structured, typed object using a language model.
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
    model: LanguageModelV1;
    schema: z.Schema<T>;
    mode?: 'auto' | 'json' | 'tool' | 'grammar';
  }): Promise<GenerateObjectResult<T>> {
  const retry = retryWithExponentialBackoff({ maxRetries });
  const jsonSchema = zodToJsonSchema(schema);

  // use the default provider mode when the mode is set to 'auto' or unspecified
  if (mode === 'auto' || mode == null) {
    mode = model.defaultObjectGenerationMode;
  }

  let result: string;
  let finishReason: LanguageModelV1FinishReason;
  let usage: Parameters<typeof calculateTokenUsage>[0];

  switch (mode) {
    case 'json': {
      const generateResult = await retry(() =>
        model.doGenerate({
          mode: { type: 'object-json' },
          ...prepareCallSettings(settings),
          inputFormat: getInputFormat({ prompt, messages }),
          prompt: convertToLanguageModelPrompt({
            system: injectJsonSchemaIntoSystem({ system, schema: jsonSchema }),
            prompt,
            messages,
          }),
          abortSignal,
        }),
      );

      if (generateResult.text === undefined) {
        throw new NoTextGeneratedError();
      }

      result = generateResult.text;
      finishReason = generateResult.finishReason;
      usage = generateResult.usage;

      break;
    }

    case 'grammar': {
      const generateResult = await retry(() =>
        model.doGenerate({
          mode: { type: 'object-grammar', schema: jsonSchema },
          ...settings,
          inputFormat: getInputFormat({ prompt, messages }),
          prompt: convertToLanguageModelPrompt({
            system: injectJsonSchemaIntoSystem({ system, schema: jsonSchema }),
            prompt,
            messages,
          }),
          abortSignal,
        }),
      );

      if (generateResult.text === undefined) {
        throw new NoTextGeneratedError();
      }

      result = generateResult.text;
      finishReason = generateResult.finishReason;
      usage = generateResult.usage;

      break;
    }

    case 'tool': {
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
          inputFormat: getInputFormat({ prompt, messages }),
          prompt: convertToLanguageModelPrompt({ system, prompt, messages }),
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
  });
}

export class GenerateObjectResult<T> {
  readonly object: T;
  readonly finishReason: LanguageModelV1FinishReason;
  readonly usage: TokenUsage;

  constructor(options: {
    object: T;
    finishReason: LanguageModelV1FinishReason;
    usage: TokenUsage;
  }) {
    this.object = options.object;
    this.finishReason = options.finishReason;
    this.usage = options.usage;
  }
}
