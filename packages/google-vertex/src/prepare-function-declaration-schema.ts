import { UnsupportedFunctionalityError } from '@ai-sdk/provider';
import {
  FunctionDeclarationSchema,
  FunctionDeclarationSchemaProperty,
  FunctionDeclarationSchemaType,
} from '@google-cloud/vertexai';
import { JSONSchema7Definition } from 'json-schema';

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
  jsonSchema: JSONSchema7Definition,
): FunctionDeclarationSchema {
  if (typeof jsonSchema === 'boolean') {
    return {
      type: FunctionDeclarationSchemaType.BOOLEAN,
      properties: {},
    };
  }

  const type = jsonSchema.type;
  switch (type) {
    case 'number':
    case 'integer':
    case 'boolean':
    case 'string':
      return {
        type: primitiveTypes[type],
        description: jsonSchema.description,
        required: jsonSchema.required,
        properties: {},
      };

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

    case 'array':
      // TODO
      throw new UnsupportedFunctionalityError({
        functionality: 'Arrays are not supported in tool parameters',
      });

    default: {
      throw new UnsupportedFunctionalityError({
        functionality: `json schema type: ${type}`,
      });
    }
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
    // array:
    case 'array': {
      const items = jsonSchema.items;

      if (items == null) {
        throw new UnsupportedFunctionalityError({
          functionality:
            'Array without items is not supported in tool parameters',
        });
      }

      if (Array.isArray(items)) {
        throw new UnsupportedFunctionalityError({
          functionality: 'Tuple arrays are not supported in tool parameters',
        });
      }

      return {
        type: FunctionDeclarationSchemaType.ARRAY,
        description: jsonSchema.description,
        required: jsonSchema.required,
        items: prepareFunctionDeclarationSchema(items),
      };
    }
    // nested object:
    case 'object':
      return {
        type: FunctionDeclarationSchemaType.OBJECT,
        properties: Object.entries(jsonSchema.properties ?? {}).reduce(
          (acc, [key, value]) => {
            acc[key] = prepareFunctionDeclarationSchema(value);
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
