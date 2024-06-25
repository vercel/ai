import {
  FunctionDeclarationSchema,
  FunctionDeclarationSchemaType,
} from '@google-cloud/vertexai';
import { JSONSchema7 } from 'json-schema';
import { prepareFunctionDeclarationSchema } from './prepare-function-declaration-schema';

it('should convert a string property', () => {
  const jsonSchema: JSONSchema7 = {
    type: 'object',
    properties: {
      testProperty: { type: 'string' },
    },
  };

  const expected: FunctionDeclarationSchema = {
    type: FunctionDeclarationSchemaType.OBJECT,
    properties: {
      testProperty: { type: FunctionDeclarationSchemaType.STRING },
    },
  };

  expect(prepareFunctionDeclarationSchema(jsonSchema)).toEqual(expected);
});

it('should convert number property', () => {
  const jsonSchema: JSONSchema7 = {
    type: 'object',
    properties: {
      testProperty: { type: 'number' },
    },
  };

  const expected: FunctionDeclarationSchema = {
    type: FunctionDeclarationSchemaType.OBJECT,
    properties: {
      testProperty: { type: FunctionDeclarationSchemaType.NUMBER },
    },
  };

  expect(prepareFunctionDeclarationSchema(jsonSchema)).toEqual(expected);
});

it('should convert integer property', () => {
  const jsonSchema: JSONSchema7 = {
    type: 'object',
    properties: {
      testProperty: { type: 'integer' },
    },
  };

  const expected: FunctionDeclarationSchema = {
    type: FunctionDeclarationSchemaType.OBJECT,
    properties: {
      testProperty: { type: FunctionDeclarationSchemaType.INTEGER },
    },
  };

  expect(prepareFunctionDeclarationSchema(jsonSchema)).toEqual(expected);
});

it('should convert boolean property', () => {
  const jsonSchema: JSONSchema7 = {
    type: 'object',
    properties: {
      testProperty: { type: 'boolean' },
    },
  };

  const expected: FunctionDeclarationSchema = {
    type: FunctionDeclarationSchemaType.OBJECT,
    properties: {
      testProperty: { type: FunctionDeclarationSchemaType.BOOLEAN },
    },
  };

  expect(prepareFunctionDeclarationSchema(jsonSchema)).toEqual(expected);
});

it('should convert property description', () => {
  const jsonSchema: JSONSchema7 = {
    type: 'object',
    properties: {
      testProperty: { type: 'string', description: 'test-description' },
    },
  };

  const expected: FunctionDeclarationSchema = {
    type: FunctionDeclarationSchemaType.OBJECT,
    properties: {
      testProperty: {
        type: FunctionDeclarationSchemaType.STRING,
        description: 'test-description',
      },
    },
  };

  expect(prepareFunctionDeclarationSchema(jsonSchema)).toEqual(expected);
});

it('should convert an object type with several properties', () => {
  const jsonSchema: JSONSchema7 = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      age: { type: 'integer' },
    },
    required: ['name'],
  };

  const expected: FunctionDeclarationSchema = {
    type: FunctionDeclarationSchemaType.OBJECT,
    description: undefined,
    properties: {
      name: { type: FunctionDeclarationSchemaType.STRING },
      age: { type: FunctionDeclarationSchemaType.INTEGER },
    },
    required: ['name'],
  };

  expect(prepareFunctionDeclarationSchema(jsonSchema)).toEqual(expected);
});

it('should convert a nested object type', () => {
  const jsonSchema: JSONSchema7 = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      address: {
        type: 'object',
        properties: {
          street: { type: 'string' },
          city: { type: 'string' },
        },
      },
    },
    required: ['name'],
  };

  const expected: FunctionDeclarationSchema = {
    type: FunctionDeclarationSchemaType.OBJECT,
    description: undefined,
    properties: {
      name: {
        type: FunctionDeclarationSchemaType.STRING,
        description: undefined,
      },
      address: {
        type: FunctionDeclarationSchemaType.OBJECT,
        description: undefined,
        properties: {
          street: {
            type: FunctionDeclarationSchemaType.STRING,
            description: undefined,
            properties: {},
          },
          city: {
            type: FunctionDeclarationSchemaType.STRING,
            description: undefined,
            properties: {},
          },
        },
      },
    },
    required: ['name'],
  };

  expect(prepareFunctionDeclarationSchema(jsonSchema)).toEqual(expected);
});

it('should convert a nested object type with description', () => {
  const jsonSchema: JSONSchema7 = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      address: {
        type: 'object',
        description: 'Address description',
        properties: {
          street: { type: 'string', description: 'Street description' },
          city: { type: 'string', description: 'City description' },
        },
      },
    },
    required: ['name'],
  };

  const expected: FunctionDeclarationSchema = {
    type: FunctionDeclarationSchemaType.OBJECT,
    description: undefined,
    properties: {
      name: {
        type: FunctionDeclarationSchemaType.STRING,
        description: undefined,
      },
      address: {
        type: FunctionDeclarationSchemaType.OBJECT,
        description: 'Address description',
        properties: {
          street: {
            type: FunctionDeclarationSchemaType.STRING,
            description: 'Street description',
            properties: {},
          },
          city: {
            type: FunctionDeclarationSchemaType.STRING,
            description: 'City description',
            properties: {},
          },
        },
      },
    },
    required: ['name'],
  };

  expect(prepareFunctionDeclarationSchema(jsonSchema)).toEqual(expected);
});

it('should convert an array of strings', () => {
  const jsonSchema: JSONSchema7 = {
    type: 'object',
    properties: {
      names: {
        type: 'array',
        items: {
          type: 'string',
        },
      },
    },
  };

  const expected: FunctionDeclarationSchema = {
    type: FunctionDeclarationSchemaType.OBJECT,
    properties: {
      names: {
        type: FunctionDeclarationSchemaType.ARRAY,
        items: {
          type: FunctionDeclarationSchemaType.STRING,
          properties: {},
        },
      },
    },
  };

  expect(prepareFunctionDeclarationSchema(jsonSchema)).toEqual(expected);
});

it('should convert an array of objects', () => {
  const jsonSchema: JSONSchema7 = {
    type: 'object',
    properties: {
      people: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            age: { type: 'integer' },
          },
        },
      },
    },
  };

  const expected: FunctionDeclarationSchema = {
    type: FunctionDeclarationSchemaType.OBJECT,
    properties: {
      people: {
        type: FunctionDeclarationSchemaType.ARRAY,
        items: {
          type: FunctionDeclarationSchemaType.OBJECT,
          properties: {
            name: { type: FunctionDeclarationSchemaType.STRING },
            age: { type: FunctionDeclarationSchemaType.INTEGER },
          },
        },
      },
    },
  };

  expect(prepareFunctionDeclarationSchema(jsonSchema)).toEqual(expected);
});
