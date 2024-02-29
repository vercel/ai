import { z } from 'zod';
import { safeParseJSON } from '../../schema/parse-json';
import { ZodSchema } from '../../schema/zod-schema';
import { LanguageModel } from '../language-model';
import { convertToChatPrompt } from '../prompt/convert-to-chat-prompt';
import { InstructionPrompt } from '../prompt/instruction-prompt';
import { injectJsonSchemaIntoInstructionPrompt } from './inject-json-schema-into-instruction-prompt';
import { NoObjectGeneratedError } from './no-object-generated-error';
import { ObjectParseError } from './object-parse-error';
import { ObjectValidationError } from './object-validation-error';

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

  let result: string;

  switch (objectMode) {
    case 'json': {
      const generateResult = await model.doGenerate({
        mode: { type: 'object-json' },
        prompt: convertToChatPrompt(
          injectJsonSchemaIntoInstructionPrompt({
            prompt,
            schema: jsonSchema,
          }),
        ),
      });

      if (generateResult.text === undefined) {
        throw new NoObjectGeneratedError();
      }

      result = generateResult.text;

      break;
    }

    case 'tool': {
      const generateResult = await model.doGenerate({
        mode: {
          type: 'object-tool',
          tool: {
            name: 'json',
            description: 'Respond with a JSON object.',
            parameters: jsonSchema,
          },
        },
        prompt: convertToChatPrompt(prompt),
      });

      const functionArgs = generateResult.toolCalls?.[0]?.args;

      if (functionArgs === undefined) {
        throw new NoObjectGeneratedError();
      }

      result = functionArgs;

      break;
    }

    default: {
      const _exhaustiveCheck: never = objectMode;
      throw new Error(`Unsupported objectMode: ${_exhaustiveCheck}`);
    }
  }

  const parseResult = safeParseJSON({ text: result });

  if (!parseResult.success) {
    throw new ObjectParseError({
      valueText: result,
      cause: parseResult.error,
    });
  }

  const validationResult = schema.validate(parseResult.value);

  if (!validationResult.success) {
    throw new ObjectValidationError({
      valueText: result,
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
