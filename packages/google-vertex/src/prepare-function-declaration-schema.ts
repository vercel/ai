import { UnsupportedFunctionalityError } from '@ai-sdk/provider';
import {
  FunctionDeclarationSchema,
  FunctionDeclarationSchemaProperty,
  FunctionDeclarationSchemaType,
} from '@google-cloud/vertexai';
import { JSONSchema7, JSONSchema7Definition } from 'json-schema';

const primitiveTypes = {
  string: FunctionDeclarationSchemaType.STRING,
  number: FunctionDeclarationSchemaType.NUMBER,
  integer: FunctionDeclarationSchemaType.INTEGER,
  boolean: FunctionDeclarationSchemaType.BOOLEAN,
};

/**
Converts the tool parameters JSON schema to the format required by Vertex AI.
 */
export function prepareFunctionDeclarationSchema(
  jsonSchema: JSONSchema7,
): FunctionDeclarationSchema {
  if (jsonSchema.type !== 'object') {
    throw new UnsupportedFunctionalityError({
      functionality: "JSON schema must have 'object' type as root",
    });
  }

  return {
    type: FunctionDeclarationSchemaType.OBJECT,
    properties: Object.entries(jsonSchema.properties ?? {}).reduce(
      (acc, [key, value]) => {
        acc[key] = prepareFunctionDeclarationSchemaProperty(value);
        return acc;
      },
      {} as Record<string, FunctionDeclarationSchemaProperty>,
    ),
    description: jsonSchema.description,
    required: jsonSchema.required,
  };
}

function prepareFunctionDeclarationSchemaProperty(
  jsonSchema: JSONSchema7Definition,
): FunctionDeclarationSchemaProperty {
  if (typeof jsonSchema === 'boolean') {
    return {
      type: FunctionDeclarationSchemaType.BOOLEAN,
    };
  }

  const type = jsonSchema.type;

  switch (type) {
    // primitive types:
    case 'number':
    case 'integer':
    case 'boolean':
    case 'string': {
      return {
        type: primitiveTypes[type],
        description: jsonSchema.description,
        required: jsonSchema.required,
      };
    }
    // nested object:
    case 'object':
      return {
        type: FunctionDeclarationSchemaType.OBJECT,
        properties: Object.entries(jsonSchema.properties ?? {}).reduce(
          (acc, [key, value]) => {
            if (typeof value === 'boolean') {
              acc[key] = {
                type: FunctionDeclarationSchemaType.BOOLEAN,
                properties: {},
              };
            } else {
              switch (value.type) {
                case 'number':
                case 'integer':
                case 'boolean':
                case 'string':
                  acc[key] = {
                    type: primitiveTypes[value.type],
                    description: value.description,
                    required: value.required,
                    properties: {},
                  };
                  break;
                default:
                  acc[key] = prepareFunctionDeclarationSchema(value);
                  break;
              }
            }

            return acc;
          },
          {} as Record<string, FunctionDeclarationSchema>,
        ),
        description: jsonSchema.description,
        required: jsonSchema.required,
      };
    default:
      throw new Error(`Unsupported type: ${type}`);
  }
}
