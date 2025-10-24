import {
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
  readonly type: 'object' | 'text';

  responseFormat: PromiseLike<LanguageModelV3CallOptions['responseFormat']>;

  parseOutput(
    options: { text: string },
    context: {
      response: LanguageModelResponseMetadata;
      usage: LanguageModelUsage;
      finishReason: FinishReason;
    },
  ): Promise<OUTPUT>;

  parsePartial(options: {
    text: string;
  }): Promise<{ partial: PARTIAL } | undefined>;
}

/**
 * Output specification for text generation.
 *
 * @returns An output specification for generating text.
 */
export const text = (): Output<string, string> => ({
  type: 'text',

  responseFormat: Promise.resolve({ type: 'text' }),

  async parseOutput({ text }: { text: string }) {
    return text;
  },

  async parsePartial({ text }: { text: string }) {
    return { partial: text };
  },
});

/**
 * Output specification for typed object generation using schemas.
 *
 * @param schema - The schema of the object to generate.
 *
 * @returns An output specification for generating objects with the specified schema.
 */
export const object = <OUTPUT>({
  schema: inputSchema,
}: {
  schema: FlexibleSchema<OUTPUT>;
}): Output<OUTPUT, DeepPartial<OUTPUT>> => {
  const schema = asSchema(inputSchema);

  return {
    type: 'object',

    responseFormat: resolve(schema.jsonSchema).then(jsonSchema => ({
      type: 'json' as const,
      schema: jsonSchema,
    })),

    async parseOutput(
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

    async parsePartial({ text }: { text: string }) {
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
            partial: result.value as DeepPartial<OUTPUT>,
          };
        }

        default: {
          const _exhaustiveCheck: never = result.state;
          throw new Error(`Unsupported parse state: ${_exhaustiveCheck}`);
        }
      }
    },
  };
};

export const array = <ELEMENT>({
  element: inputElementSchema,
}: {
  element: FlexibleSchema<ELEMENT>;
}): Output<Array<ELEMENT>, Array<ELEMENT>> => {
  const elementSchema = asSchema(inputElementSchema);

  return {
    type: 'object',

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

    async parseOutput(
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

    async parsePartial({ text }: { text: string }) {
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

        default: {
          const _exhaustiveCheck: never = result.state;
          throw new Error(`Unsupported parse state: ${_exhaustiveCheck}`);
        }
      }
    },
  };
};

export const choice = <ELEMENT extends string>({
  options: choiceOptions,
}: {
  options: Array<ELEMENT>;
}): Output<ELEMENT, ELEMENT> => {
  return {
    type: 'object',

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

    async parseOutput(
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

      return outerValue.result as ELEMENT;
    },

    async parsePartial({ text }: { text: string }) {
      return undefined;
    },
  };
};
