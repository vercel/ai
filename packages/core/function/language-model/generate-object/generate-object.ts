import { z } from 'zod';
import { safeParseJSON } from '../../schema/parse-json';
import { ZodSchema } from '../../schema/zod-schema';
import { LanguageModel } from '../language-model';
import { ChatPrompt } from '../prompt/chat-prompt';
import { InstructionPrompt } from '../prompt/instruction-prompt';
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
  prompt: InstructionPrompt | ChatPrompt;
}): Promise<GenerateObjectResult<T>> {
  const schema = new ZodSchema(zodSchema);

  const result = await model.doGenerateJsonText({
    schema: schema.getJsonSchema(),
    prompt,
  });

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
