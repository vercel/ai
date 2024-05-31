import {
  FunctionDeclarationSchema,
  FunctionDeclarationSchemaType,
} from '@google-cloud/vertexai';
import { prepareToolParameters } from './prepare-tool-parameters';
import { JSONSchema7 } from 'json-schema';

describe('STRING', () => {
  it('should convert a simple string type', () => {
    const jsonSchema: JSONSchema7 = {
      type: 'string',
    };

    const expected: FunctionDeclarationSchema = {
      type: FunctionDeclarationSchemaType.STRING,
      description: undefined,
      properties: {},
    };

    expect(prepareToolParameters(jsonSchema)).toEqual(expected);
  });

  it('should handle description property', () => {
    const jsonSchema: JSONSchema7 = {
      type: 'string',
      description: 'test-description',
    };

    const expected: FunctionDeclarationSchema = {
      type: FunctionDeclarationSchemaType.STRING,
      properties: {},
      description: 'test-description',
    };

    expect(prepareToolParameters(jsonSchema)).toEqual(expected);
  });
});

describe('NUMBER', () => {
  it('should convert a number type with description', () => {
    const jsonSchema: JSONSchema7 = {
      type: 'number',
      description: 'A number parameter',
    };

    const expected: FunctionDeclarationSchema = {
      type: FunctionDeclarationSchemaType.NUMBER,
      properties: {},
      description: 'A number parameter',
    };

    expect(prepareToolParameters(jsonSchema)).toEqual(expected);
  });
});

describe('INTEGER', () => {
  it('should convert an integer type', () => {
    const jsonSchema: JSONSchema7 = {
      type: 'integer',
    };

    const expected: FunctionDeclarationSchema = {
      type: FunctionDeclarationSchemaType.INTEGER,
      properties: {},
    };

    expect(prepareToolParameters(jsonSchema)).toEqual(expected);
  });
});

describe('BOOLEAN', () => {
  it('should convert a boolean type', () => {
    const jsonSchema: JSONSchema7 = {
      type: 'boolean',
    };

    const expected: FunctionDeclarationSchema = {
      type: FunctionDeclarationSchemaType.BOOLEAN,
      properties: {},
    };

    expect(prepareToolParameters(jsonSchema)).toEqual(expected);
  });
});

describe('OBJECT', () => {
  it('should convert an object type with properties', () => {
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

    expect(prepareToolParameters(jsonSchema)).toEqual(expected);
  });

  // TODO array in object
  // TODO object in object
  // TODO special properties
});

describe('ARRAY', () => {
  // TODO
});
