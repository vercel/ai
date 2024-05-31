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
export function prepareToolParameters(
  jsonSchema: JSONSchema7,
): FunctionDeclarationSchema {
  const type = jsonSchema.type;

  switch (type) {
    // primitive types:
    case 'number':
    case 'integer':
    case 'boolean':
    case 'string': {
      return {
        type: primitiveTypes[type],
        properties: {},
        description: jsonSchema.description,
        required: jsonSchema.required,
      };
    }
    case 'object':
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
    default:
      throw new Error(`Unsupported type: ${type}`);
  }
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
    default:
      throw new Error(`Unsupported type: ${type}`);
  }
}
