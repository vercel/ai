import {
  isJSONArray,
  isJSONObject,
  JSONObject,
  JSONValue,
  TypeValidationError,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { safeValidateTypes, ValidationResult } from '@ai-sdk/provider-utils';
import { asSchema, DeepPartial, Schema } from '@ai-sdk/ui-utils';
import { NoObjectGeneratedError } from './no-object-generated-error';
import { JSONSchema7 } from 'json-schema';
import { ObjectStreamPart } from './stream-object-result';
import {
  AsyncIterableStream,
  createAsyncIterableStream,
} from '../util/async-iterable-stream';
import { z } from 'zod';

export interface OutputStrategy<PARTIAL, RESULT, ELEMENT_STREAM> {
  readonly type: 'object' | 'array' | 'no-schema';
  readonly jsonSchema: JSONSchema7 | undefined;

  validatePartialResult({
    value,
    parseState,
  }: {
    value: JSONValue;
    parseState:
      | 'undefined-input'
      | 'successful-parse'
      | 'repaired-parse'
      | 'failed-parse';
  }): ValidationResult<PARTIAL>;
  validateFinalResult(value: JSONValue | undefined): ValidationResult<RESULT>;

  createElementStream(
    originalStream: ReadableStream<ObjectStreamPart<PARTIAL>>,
  ): ELEMENT_STREAM;
}

const noSchemaOutputStrategy: OutputStrategy<JSONValue, JSONValue, never> = {
  type: 'no-schema',
  jsonSchema: undefined,

  validatePartialResult({ value }): ValidationResult<JSONValue> {
    return { success: true, value };
  },

  validateFinalResult(
    value: JSONValue | undefined,
  ): ValidationResult<JSONValue> {
    return value === undefined
      ? { success: false, error: new NoObjectGeneratedError() }
      : { success: true, value };
  },

  createElementStream() {
    throw new UnsupportedFunctionalityError({
      functionality: 'element streams in no-schema mode',
    });
  },
};

const objectOutputStrategy = <OBJECT>(
  schema: Schema<OBJECT>,
): OutputStrategy<DeepPartial<OBJECT>, OBJECT, never> => ({
  type: 'object',
  jsonSchema: schema.jsonSchema,

  validatePartialResult({ value }): ValidationResult<DeepPartial<OBJECT>> {
    // Note: currently no validation of partial results:
    return { success: true, value: value as DeepPartial<OBJECT> };
  },

  validateFinalResult(value: JSONValue | undefined): ValidationResult<OBJECT> {
    return safeValidateTypes({ value, schema });
  },

  createElementStream() {
    throw new UnsupportedFunctionalityError({
      functionality: 'element streams in object mode',
    });
  },
});

const arrayOutputStrategy = <ELEMENT>(
  schema: Schema<ELEMENT>,
): OutputStrategy<ELEMENT[], ELEMENT[], AsyncIterableStream<ELEMENT>> => {
  // remove $schema from schema.jsonSchema:
  const { $schema, ...itemSchema } = schema.jsonSchema;

  return {
    type: 'object',

    // wrap in object that contains array of elements, since most LLMs will not
    // be able to generate an array directly:
    // possible future optimization: use arrays directly when model supports grammar-guided generation
    jsonSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        elements: { type: 'array', items: itemSchema },
      },
      required: ['elements'],
      additionalProperties: false,
    },

    validatePartialResult({
      value,
      parseState,
    }): ValidationResult<Array<ELEMENT>> {
      // check that the value is an object that contains an array of elements:
      if (!isJSONObject(value) || !isJSONArray(value.elements)) {
        return {
          success: false,
          error: new TypeValidationError({
            value,
            cause: 'value must be an object that contains an array of elements',
          }),
        };
      }

      const inputArray = value.elements as Array<JSONObject>;
      const resultArray: Array<ELEMENT> = [];

      for (let i = 0; i < inputArray.length; i++) {
        const element = inputArray[i];
        const result = safeValidateTypes({ value: element, schema });

        // special treatment for last element:
        // ignore parse failures or validation failures, since they indicate that the
        // last element is incomplete and should not be included in the result
        if (
          i === inputArray.length - 1 &&
          (!result.success || parseState !== 'successful-parse')
        ) {
          continue;
        }

        if (!result.success) {
          return result;
        }

        resultArray.push(result.value);
      }

      return { success: true, value: resultArray };
    },

    validateFinalResult(
      value: JSONValue | undefined,
    ): ValidationResult<Array<ELEMENT>> {
      // check that the value is an object that contains an array of elements:
      if (!isJSONObject(value) || !isJSONArray(value.elements)) {
        return {
          success: false,
          error: new TypeValidationError({
            value,
            cause: 'value must be an object that contains an array of elements',
          }),
        };
      }

      const inputArray = value.elements as Array<JSONObject>;

      // check that each element in the array is of the correct type:
      for (const element of inputArray) {
        const result = safeValidateTypes({ value: element, schema });
        if (!result.success) {
          return result;
        }
      }

      return { success: true, value: inputArray as Array<ELEMENT> };
    },

    createElementStream(
      originalStream: ReadableStream<ObjectStreamPart<ELEMENT[]>>,
    ) {
      let publishedElements = 0;

      return createAsyncIterableStream(originalStream, {
        transform(chunk, controller) {
          switch (chunk.type) {
            case 'object': {
              const array = chunk.object;

              // publish new elements one by one:
              for (; publishedElements < array.length; publishedElements++) {
                controller.enqueue(array[publishedElements]);
              }

              break;
            }

            case 'text-delta':
            case 'finish':
              break;

            case 'error':
              controller.error(chunk.error);
              break;

            default: {
              const _exhaustiveCheck: never = chunk;
              throw new Error(`Unsupported chunk type: ${_exhaustiveCheck}`);
            }
          }
        },
      });
    },
  };
};

export function getOutputStrategy<SCHEMA>({
  output,
  schema,
}: {
  output: 'no-schema' | 'object' | 'array';
  schema?: z.Schema<SCHEMA, z.ZodTypeDef, any> | Schema<SCHEMA>;
}): OutputStrategy<any, any, any> {
  switch (output) {
    case 'object':
      return objectOutputStrategy(asSchema(schema!));
    case 'array':
      return arrayOutputStrategy(asSchema(schema!));
    case 'no-schema':
      return noSchemaOutputStrategy;
    default: {
      const _exhaustiveCheck: never = output;
      throw new Error(`Unsupported output: ${_exhaustiveCheck}`);
    }
  }
}
