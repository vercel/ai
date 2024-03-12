import { z } from 'zod';
import { LanguageModel } from '../language-model';
import { CallSettings } from '../prompt/call-settings';
import { convertToLanguageModelPrompt } from '../prompt/convert-to-language-model-prompt';
import { getInputFormat } from '../prompt/get-input-format';
import { Prompt } from '../prompt/prompt';
import { safeParseJSON } from '../schema/parse-json';
import { ZodSchema } from '../schema/zod-schema';
import { injectJsonSchemaIntoSystem } from './inject-json-schema-into-system';
import { NoTextGeneratedError } from '../language-model/errors/no-object-generated-error';

/**
 * Generate a structured, typed object using a language model.
 */
export async function generateObject<T>({
  model,
  schema: zodSchema,
  mode,
  system,
  prompt,
  messages,
  ...settings
}: CallSettings &
  Prompt & {
    model: LanguageModel;
    schema: z.Schema<T>;
    mode?: 'json' | 'tool' | 'grammar';
  }): Promise<GenerateObjectResult<T>> {
  const schema = new ZodSchema(zodSchema);
  const jsonSchema = schema.getJsonSchema();

  let result: string;

  mode = mode ?? model.defaultObjectGenerationMode;
  switch (mode) {
    case 'json': {
      const generateResult = await model.doGenerate({
        mode: { type: 'object-json' },
        ...settings,
        inputFormat: getInputFormat({ prompt, messages }),
        prompt: convertToLanguageModelPrompt({
          system: injectJsonSchemaIntoSystem({ system, schema: jsonSchema }),
          prompt,
          messages,
        }),
      });

      if (generateResult.text === undefined) {
        throw new NoTextGeneratedError();
      }

      result = generateResult.text;

      break;
    }

    case 'grammar': {
      const generateResult = await model.doGenerate({
        mode: { type: 'object-grammar', schema: jsonSchema },
        ...settings,
        inputFormat: getInputFormat({ prompt, messages }),
        prompt: convertToLanguageModelPrompt({
          system: injectJsonSchemaIntoSystem({ system, schema: jsonSchema }),
          prompt,
          messages,
        }),
      });

      if (generateResult.text === undefined) {
        throw new NoTextGeneratedError();
      }

      result = generateResult.text;

      break;
    }

    case 'tool': {
      const generateResult = await model.doGenerate({
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
      });

      const functionArgs = generateResult.toolCalls?.[0]?.args;

      if (functionArgs === undefined) {
        throw new NoTextGeneratedError();
      }

      result = functionArgs;

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
  });
}

export class GenerateObjectResult<T> {
  readonly object: T;

  constructor(options: { object: T }) {
    this.object = options.object;
  }
}
