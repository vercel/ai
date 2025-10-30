import {
  JSONValue,
  LanguageModelV3CallOptions,
  TypeValidationError,
} from '@ai-sdk/provider';
import {
  asSchema,
  FlexibleSchema,
  resolve,
  safeParseJSON,
  safeValidateTypes,
} from '@ai-sdk/provider-utils';
import { NoObjectGeneratedError } from '../error/no-object-generated-error';
import { FinishReason } from '../types/language-model';
import { LanguageModelResponseMetadata } from '../types/language-model-response-metadata';
import { LanguageModelUsage } from '../types/usage';
import { DeepPartial } from '../util/deep-partial';
import { parsePartialJson } from '../util/parse-partial-json';

export interface Output<OUTPUT = any, PARTIAL = any> {
  /**
   * The response format to use for the model.
   */
  responseFormat: PromiseLike<LanguageModelV3CallOptions['responseFormat']>;

  /**
   * Parses the complete output of the model.
   */
  parseCompleteOutput(
    options: { text: string },
    context: {
      response: LanguageModelResponseMetadata;
      usage: LanguageModelUsage;
      finishReason: FinishReason;
    },
  ): Promise<OUTPUT>;

  /**
   * Parses the partial output of the model.
   */
  parsePartialOutput(options: {
    text: string;
  }): Promise<{ partial: PARTIAL } | undefined>;
}

/**
 * Output specification for text generation.
 * This is the default output mode that generates plain text.
 *
 * @returns An output specification for generating text.
 */
export const text = (): Output<string, string> => ({
  responseFormat: Promise.resolve({ type: 'text' }),

  async parseCompleteOutput({ text }: { text: string }) {
    return text;
  },

  async parsePartialOutput({ text }: { text: string }) {
    return { partial: text };
  },
});

/**
 * Output specification for typed object generation using schemas.
 * When the model generates a text response, it will return an object that matches the schema.
 *
 * @param schema - The schema of the object to generate.
 *
 * @returns An output specification for generating objects with the specified schema.
 */
export const object = <OBJECT>({
  schema: inputSchema,
}: {
  schema: FlexibleSchema<OBJECT>;
}): Output<OBJECT, DeepPartial<OBJECT>> => {
  const schema = asSchema(inputSchema);

  return {
    responseFormat: resolve(schema.jsonSchema).then(jsonSchema => ({
      type: 'json' as const,
      schema: jsonSchema,
    })),

    async parseCompleteOutput(
      { text }: { text: string },
      context: {
        response: LanguageModelResponseMetadata;
        usage: LanguageModelUsage;
        finishReason: FinishReason;
      },
    ) {
      const parseResult = await safeParseJSON({ text });

      if (!parseResult.success) {
        throw new NoObjectGeneratedError({
          message: 'No object generated: could not parse the response.',
          cause: parseResult.error,
          text,
          response: context.response,
          usage: context.usage,
          finishReason: context.finishReason,
        });
      }

      const validationResult = await safeValidateTypes({
        value: parseResult.value,
        schema,
      });

      if (!validationResult.success) {
        throw new NoObjectGeneratedError({
          message: 'No object generated: response did not match schema.',
          cause: validationResult.error,
          text,
          response: context.response,
          usage: context.usage,
          finishReason: context.finishReason,
        });
      }

      return validationResult.value;
    },

    async parsePartialOutput({ text }: { text: string }) {
      const result = await parsePartialJson(text);

      switch (result.state) {
        case 'failed-parse':
        case 'undefined-input': {
          return undefined;
        }

        case 'repaired-parse':
        case 'successful-parse': {
          return {
            // Note: currently no validation of partial results:
            partial: result.value as DeepPartial<OBJECT>,
          };
        }
      }
    },
  };
};

/**
 * Output specification for array generation.
 * When the model generates a text response, it will return an array of elements.
 *
 * @param element - The schema of the array elements to generate.
 *
 * @returns An output specification for generating an array of elements.
 */
export const array = <ELEMENT>({
  element: inputElementSchema,
}: {
  element: FlexibleSchema<ELEMENT>;
}): Output<Array<ELEMENT>, Array<ELEMENT>> => {
  const elementSchema = asSchema(inputElementSchema);

  return {
    // JSON schema that describes an array of elements:
    responseFormat: resolve(elementSchema.jsonSchema).then(jsonSchema => {
      // remove $schema from schema.jsonSchema:
      const { $schema, ...itemSchema } = jsonSchema;

      return {
        type: 'json' as const,
        schema: {
          $schema: 'http://json-schema.org/draft-07/schema#',
          type: 'object',
          properties: {
            elements: { type: 'array', items: itemSchema },
          },
          required: ['elements'],
          additionalProperties: false,
        },
      };
    }),

    async parseCompleteOutput(
      { text }: { text: string },
      context: {
        response: LanguageModelResponseMetadata;
        usage: LanguageModelUsage;
        finishReason: FinishReason;
      },
    ) {
      const parseResult = await safeParseJSON({ text });

      if (!parseResult.success) {
        throw new NoObjectGeneratedError({
          message: 'No object generated: could not parse the response.',
          cause: parseResult.error,
          text,
          response: context.response,
          usage: context.usage,
          finishReason: context.finishReason,
        });
      }

      const outerValue = parseResult.value;

      if (
        outerValue == null ||
        typeof outerValue !== 'object' ||
        !('elements' in outerValue) ||
        !Array.isArray(outerValue.elements)
      ) {
        throw new NoObjectGeneratedError({
          message: 'No object generated: response did not match schema.',
          cause: new TypeValidationError({
            value: outerValue,
            cause: 'response must be an object with an elements array',
          }),
          text,
          response: context.response,
          usage: context.usage,
          finishReason: context.finishReason,
        });
      }

      for (const element of outerValue.elements) {
        const validationResult = await safeValidateTypes({
          value: element,
          schema: elementSchema,
        });

        if (!validationResult.success) {
          throw new NoObjectGeneratedError({
            message: 'No object generated: response did not match schema.',
            cause: validationResult.error,
            text,
            response: context.response,
            usage: context.usage,
            finishReason: context.finishReason,
          });
        }
      }

      return outerValue.elements as Array<ELEMENT>;
    },

    async parsePartialOutput({ text }: { text: string }) {
      const result = await parsePartialJson(text);

      switch (result.state) {
        case 'failed-parse':
        case 'undefined-input': {
          return undefined;
        }

        case 'repaired-parse':
        case 'successful-parse': {
          const outerValue = result.value;

          // no parsable elements array
          if (
            outerValue == null ||
            typeof outerValue !== 'object' ||
            !('elements' in outerValue) ||
            !Array.isArray(outerValue.elements)
          ) {
            return undefined;
          }

          const rawElements =
            result.state === 'repaired-parse' && outerValue.elements.length > 0
              ? outerValue.elements.slice(0, -1)
              : outerValue.elements;

          const parsedElements: Array<ELEMENT> = [];
          for (const rawElement of rawElements) {
            const validationResult = await safeValidateTypes({
              value: rawElement,
              schema: elementSchema,
            });

            if (validationResult.success) {
              parsedElements.push(validationResult.value);
            }
          }

          return { partial: parsedElements };
        }
      }
    },
  };
};

/**
 * Output specification for choice generation.
 * When the model generates a text response, it will return a one of the choice options.
 *
 * @param options - The available choices.
 *
 * @returns An output specification for generating a choice.
 */
export const choice = <CHOICE extends string>({
  options: choiceOptions,
}: {
  options: Array<CHOICE>;
}): Output<CHOICE, CHOICE> => {
  return {
    // JSON schema that describes an enumeration:
    responseFormat: Promise.resolve({
      type: 'json',
      schema: {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: {
          result: { type: 'string', enum: choiceOptions },
        },
        required: ['result'],
        additionalProperties: false,
      },
    } as const),

    async parseCompleteOutput(
      { text }: { text: string },
      context: {
        response: LanguageModelResponseMetadata;
        usage: LanguageModelUsage;
        finishReason: FinishReason;
      },
    ) {
      const parseResult = await safeParseJSON({ text });

      if (!parseResult.success) {
        throw new NoObjectGeneratedError({
          message: 'No object generated: could not parse the response.',
          cause: parseResult.error,
          text,
          response: context.response,
          usage: context.usage,
          finishReason: context.finishReason,
        });
      }

      const outerValue = parseResult.value;

      if (
        outerValue == null ||
        typeof outerValue !== 'object' ||
        !('result' in outerValue) ||
        typeof outerValue.result !== 'string' ||
        !choiceOptions.includes(outerValue.result as any)
      ) {
        throw new NoObjectGeneratedError({
          message: 'No object generated: response did not match schema.',
          cause: new TypeValidationError({
            value: outerValue,
            cause: 'response must be an object that contains a choice value.',
          }),
          text,
          response: context.response,
          usage: context.usage,
          finishReason: context.finishReason,
        });
      }

      return outerValue.result as CHOICE;
    },

    async parsePartialOutput({ text }: { text: string }) {
      const result = await parsePartialJson(text);

      switch (result.state) {
        case 'failed-parse':
        case 'undefined-input': {
          return undefined;
        }

        case 'repaired-parse':
        case 'successful-parse': {
          const outerValue = result.value;

          if (
            outerValue == null ||
            typeof outerValue !== 'object' ||
            !('result' in outerValue) ||
            typeof outerValue.result !== 'string'
          ) {
            return undefined;
          }

          // list of potential matches.
          const potentialMatches = choiceOptions.filter(choiceOption =>
            choiceOption.startsWith(outerValue.result as string),
          );

          if (result.state === 'successful-parse') {
            // successful parse: exact choice value
            return potentialMatches.includes(outerValue.result as any)
              ? { partial: outerValue.result as CHOICE }
              : undefined;
          } else {
            // repaired parse: only return if not ambiguous
            return potentialMatches.length === 1
              ? { partial: potentialMatches[0] as CHOICE }
              : undefined;
          }
        }
      }
    },
  };
};

/**
 * Output specification for unstructured JSON generation.
 * When the model generates a text response, it will return a JSON object.
 *
 * @returns An output specification for generating JSON.
 */
export const json = (): Output<JSONValue, JSONValue> => {
  return {
    responseFormat: Promise.resolve({
      type: 'json' as const,
    }),

    async parseCompleteOutput(
      { text }: { text: string },
      context: {
        response: LanguageModelResponseMetadata;
        usage: LanguageModelUsage;
        finishReason: FinishReason;
      },
    ) {
      const parseResult = await safeParseJSON({ text });

      if (!parseResult.success) {
        throw new NoObjectGeneratedError({
          message: 'No object generated: could not parse the response.',
          cause: parseResult.error,
          text,
          response: context.response,
          usage: context.usage,
          finishReason: context.finishReason,
        });
      }

      return parseResult.value;
    },

    async parsePartialOutput({ text }: { text: string }) {
      const result = await parsePartialJson(text);

      switch (result.state) {
        case 'failed-parse':
        case 'undefined-input': {
          return undefined;
        }

        case 'repaired-parse':
        case 'successful-parse': {
          return result.value === undefined
            ? undefined
            : { partial: result.value };
        }
      }
    },
  };
};
