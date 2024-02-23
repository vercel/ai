import { Schema, safeParseJSON } from '../../schema';
import { LanguageModel } from '../language-model';
import { LanguageModelPrompt } from '../prompt';
import { ObjectParseError } from './object-parse-error';
import { ObjectValidationError } from './object-validation-error';

/**
 * Generate a structured, typed object using a language model.
 */
export async function generateObject<T>({
  model,
  schema,
  prompt,
}: {
  model: LanguageModel;
  schema: Schema<T>;
  prompt: LanguageModelPrompt;
}): Promise<GenerateObjectResult<T>> {
  const result = await model.doGenerateJsonText({
    schema,
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
