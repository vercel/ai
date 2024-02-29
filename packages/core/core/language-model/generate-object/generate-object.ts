import { z } from 'zod';
import { safeParseJSON } from '../../schema/parse-json';
import { ZodSchema } from '../../schema/zod-schema';
import { LanguageModel, ObjectMode } from '../language-model';
import { InstructionPrompt } from '../prompt/instruction-prompt';
import { ObjectParseError } from './object-parse-error';
import { ObjectValidationError } from './object-validation-error';
import { injectJsonSchemaIntoInstructionPrompt } from '../inject-json-schema-into-instruction-prompt';
import { Schema } from '../../schema/schema';

/**
 * Generate a structured, typed object using a language model.
 */
export async function generateObject<T>({
  model,
  schema: zodSchema,
  prompt,
}: {
  model: LanguageModel;
  schema: z.Schema<T>;
  prompt: InstructionPrompt;
}): Promise<GenerateObjectResult<T>> {
  const schema = new ZodSchema(zodSchema);
  const jsonSchema = schema.getJsonSchema();
  const objectMode = model.objectMode;

  let result: {
    jsonText: string;
  };

  switch (objectMode) {
    case 'json': {
      result = await model.doGenerateJsonText({
        mode: { type: 'json' },
        prompt: injectJsonSchemaIntoInstructionPrompt({
          prompt,
          schema: jsonSchema,
        }),
      });
      break;
    }

    case 'tool': {
      result = await model.doGenerateJsonText({
        mode: {
          type: 'tool',
          tool: {
            name: 'json',
            description: 'Respond with a JSON object.',
            parameters: jsonSchema,
          },
        },
        prompt,
      });
      break;
    }

    default: {
      const _exhaustiveCheck: never = objectMode;
      throw new Error(`Unsupported objectMode: ${_exhaustiveCheck}`);
    }
  }

  const parseResult = safeParseJSON({ text: result.jsonText });

  if (!parseResult.success) {
    throw new ObjectParseError({
      valueText: result.jsonText,
      cause: parseResult.error,
    });
  }

  const validationResult = schema.validate(parseResult.value);

  if (!validationResult.success) {
    throw new ObjectValidationError({
      valueText: result.jsonText,
      value: parseResult.value,
      cause: validationResult.error,
    });
  }

  return new GenerateObjectResult({
    object: validationResult.value,
  });
}

export class GenerateObjectResult<T> {
  readonly object: T;

  constructor(options: { object: T }) {
    this.object = options.object;
  }
}
