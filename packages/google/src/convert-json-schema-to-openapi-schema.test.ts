import { JSONSchema7 } from '@ai-sdk/provider';
import { convertJSONSchemaToOpenAPISchema } from './convert-json-schema-to-openapi-schema';
import { PropertyOrderingConfig } from './google-generative-ai-settings';
import { it, expect } from 'vitest';

it('should remove additionalProperties and $schema', () => {
  const input: JSONSchema7 = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties: {
      name: { type: 'string' },
      age: { type: 'number' },
    },
    additionalProperties: false,
  };

  const expected = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      age: { type: 'number' },
    },
  };

  expect(convertJSONSchemaToOpenAPISchema(input)).toEqual(expected);
});

it('should handle nested objects and arrays', () => {
  const input: JSONSchema7 = {
    type: 'object',
    properties: {
      users: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            name: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
    },
    additionalProperties: false,
  };

  const expected = {
    type: 'object',
    properties: {
      users: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            name: { type: 'string' },
          },
        },
      },
    },
  };

  expect(convertJSONSchemaToOpenAPISchema(input)).toEqual(expected);
});

it('should convert "const" to "enum" with a single value', () => {
  const input: JSONSchema7 = {
    type: 'object',
    properties: {
      status: { const: 'active' },
    },
  };

  const expected = {
    type: 'object',
    properties: {
      status: { enum: ['active'] },
    },
  };

  expect(convertJSONSchemaToOpenAPISchema(input)).toEqual(expected);
});

it('should handle allOf, anyOf, and oneOf', () => {
  const input: JSONSchema7 = {
    type: 'object',
    properties: {
      allOfProp: { allOf: [{ type: 'string' }, { minLength: 5 }] },
      anyOfProp: { anyOf: [{ type: 'string' }, { type: 'number' }] },
      oneOfProp: { oneOf: [{ type: 'boolean' }, { type: 'null' }] },
    },
  };

  const expected = {
    type: 'object',
    properties: {
      allOfProp: {
        allOf: [{ type: 'string' }, { minLength: 5 }],
      },
      anyOfProp: {
        anyOf: [{ type: 'string' }, { type: 'number' }],
      },
      oneOfProp: {
        oneOf: [{ type: 'boolean' }, { type: 'null' }],
      },
    },
  };

  expect(convertJSONSchemaToOpenAPISchema(input)).toEqual(expected);
});

it('should convert "format: date-time" to "format: date-time"', () => {
  const input: JSONSchema7 = {
    type: 'object',
    properties: {
      timestamp: { type: 'string', format: 'date-time' },
    },
  };

  const expected = {
    type: 'object',
    properties: {
      timestamp: { type: 'string', format: 'date-time' },
    },
  };

  expect(convertJSONSchemaToOpenAPISchema(input)).toEqual(expected);
});

it('should handle required properties', () => {
  const input: JSONSchema7 = {
    type: 'object',
    properties: {
      id: { type: 'number' },
      name: { type: 'string' },
    },
    required: ['id'],
  };

  const expected = {
    type: 'object',
    properties: {
      id: { type: 'number' },
      name: { type: 'string' },
    },
    required: ['id'],
  };

  expect(convertJSONSchemaToOpenAPISchema(input)).toEqual(expected);
});

it('should convert deeply nested "const" to "enum"', () => {
  const input: JSONSchema7 = {
    type: 'object',
    properties: {
      nested: {
        type: 'object',
        properties: {
          deeplyNested: {
            anyOf: [
              {
                type: 'object',
                properties: {
                  value: {
                    const: 'specific value',
                  },
                },
              },
              {
                type: 'string',
              },
            ],
          },
        },
      },
    },
  };

  const expected = {
    type: 'object',
    properties: {
      nested: {
        type: 'object',
        properties: {
          deeplyNested: {
            anyOf: [
              {
                type: 'object',
                properties: {
                  value: {
                    enum: ['specific value'],
                  },
                },
              },
              {
                type: 'string',
              },
            ],
          },
        },
      },
    },
  };

  expect(convertJSONSchemaToOpenAPISchema(input)).toEqual(expected);
});

it('should correctly convert a complex schema with nested const and anyOf', () => {
  const input: JSONSchema7 = {
    type: 'object',
    properties: {
      name: {
        type: 'string',
      },
      age: {
        type: 'number',
      },
      contact: {
        anyOf: [
          {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                const: 'email',
              },
              value: {
                type: 'string',
              },
            },
            required: ['type', 'value'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                const: 'phone',
              },
              value: {
                type: 'string',
              },
            },
            required: ['type', 'value'],
            additionalProperties: false,
          },
        ],
      },
      occupation: {
        anyOf: [
          {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                const: 'employed',
              },
              company: {
                type: 'string',
              },
              position: {
                type: 'string',
              },
            },
            required: ['type', 'company', 'position'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                const: 'student',
              },
              school: {
                type: 'string',
              },
              grade: {
                type: 'number',
              },
            },
            required: ['type', 'school', 'grade'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                const: 'unemployed',
              },
            },
            required: ['type'],
            additionalProperties: false,
          },
        ],
      },
    },
    required: ['name', 'age', 'contact', 'occupation'],
    additionalProperties: false,
    $schema: 'http://json-schema.org/draft-07/schema#',
  };

  const expected = {
    type: 'object',
    properties: {
      name: {
        type: 'string',
      },
      age: {
        type: 'number',
      },
      contact: {
        anyOf: [
          {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['email'],
              },
              value: {
                type: 'string',
              },
            },
            required: ['type', 'value'],
          },
          {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['phone'],
              },
              value: {
                type: 'string',
              },
            },
            required: ['type', 'value'],
          },
        ],
      },
      occupation: {
        anyOf: [
          {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['employed'],
              },
              company: {
                type: 'string',
              },
              position: {
                type: 'string',
              },
            },
            required: ['type', 'company', 'position'],
          },
          {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['student'],
              },
              school: {
                type: 'string',
              },
              grade: {
                type: 'number',
              },
            },
            required: ['type', 'school', 'grade'],
          },
          {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['unemployed'],
              },
            },
            required: ['type'],
          },
        ],
      },
    },
    required: ['name', 'age', 'contact', 'occupation'],
  };

  expect(convertJSONSchemaToOpenAPISchema(input)).toEqual(expected);
});

it('should handle null type correctly', () => {
  const input: JSONSchema7 = {
    type: 'object',
    properties: {
      nullableField: {
        type: ['string', 'null'],
      },
      explicitNullField: {
        type: 'null',
      },
    },
  };

  const expected = {
    type: 'object',
    properties: {
      nullableField: {
        type: 'string',
        nullable: true,
      },
      explicitNullField: {
        type: 'null',
      },
    },
  };

  expect(convertJSONSchemaToOpenAPISchema(input)).toEqual(expected);
});

it('should handle descriptions', () => {
  const input: JSONSchema7 = {
    type: 'object',
    description: 'A user object',
    properties: {
      id: {
        type: 'number',
        description: 'The user ID',
      },
      name: {
        type: 'string',
        description: "The user's full name",
      },
      email: {
        type: 'string',
        format: 'email',
        description: "The user's email address",
      },
    },
    required: ['id', 'name'],
  };

  const expected = {
    type: 'object',
    description: 'A user object',
    properties: {
      id: {
        type: 'number',
        description: 'The user ID',
      },
      name: {
        type: 'string',
        description: "The user's full name",
      },
      email: {
        type: 'string',
        format: 'email',
        description: "The user's email address",
      },
    },
    required: ['id', 'name'],
  };

  expect(convertJSONSchemaToOpenAPISchema(input)).toEqual(expected);
});

it('should return undefined for empty object schemas', () => {
  const emptyObjectSchemas = [
    { type: 'object' },
    { type: 'object', properties: {} },
  ] as const;

  emptyObjectSchemas.forEach(schema => {
    expect(convertJSONSchemaToOpenAPISchema(schema)).toBeUndefined();
  });
});

it('should handle non-empty object schemas', () => {
  const nonEmptySchema: JSONSchema7 = {
    type: 'object',
    properties: {
      name: { type: 'string' },
    },
  };

  expect(convertJSONSchemaToOpenAPISchema(nonEmptySchema)).toEqual({
    type: 'object',
    properties: {
      name: { type: 'string' },
    },
  });
});

it('should convert string enum properties', () => {
  const schemaWithEnumProperty: JSONSchema7 = {
    type: 'object',
    properties: {
      kind: {
        type: 'string',
        enum: ['text', 'code', 'image'],
      },
    },
    required: ['kind'],
    additionalProperties: false,
    $schema: 'http://json-schema.org/draft-07/schema#',
  };

  expect(convertJSONSchemaToOpenAPISchema(schemaWithEnumProperty)).toEqual({
    type: 'object',
    properties: {
      kind: {
        type: 'string',
        enum: ['text', 'code', 'image'],
      },
    },
    required: ['kind'],
  });
});

it('should convert nullable string enum', () => {
  const schemaWithEnumProperty: JSONSchema7 = {
    type: 'object',
    properties: {
      fieldD: {
        anyOf: [
          {
            type: 'string',
            enum: ['a', 'b', 'c'],
          },
          {
            type: 'null',
          },
        ],
      },
    },
    required: ['fieldD'],
    additionalProperties: false,
    $schema: 'http://json-schema.org/draft-07/schema#',
  };

  expect(convertJSONSchemaToOpenAPISchema(schemaWithEnumProperty)).toEqual({
    required: ['fieldD'],
    type: 'object',
    properties: {
      fieldD: {
        nullable: true,
        type: 'string',
        enum: ['a', 'b', 'c'],
      },
    },
  });
});

it('should add propertyOrdering when configuration is provided', () => {
  const input: JSONSchema7 = {
    type: 'object',
    properties: {
      recipeName: { type: 'string' },
      ingredients: { type: 'array', items: { type: 'string' } },
      cookingTime: { type: 'number' },
    },
    required: ['recipeName'],
  };

  const propertyOrderingConfig: PropertyOrderingConfig = {
    recipeName: null,
    ingredients: null,
    cookingTime: null,
  };

  const expected = {
    type: 'object',
    properties: {
      recipeName: { type: 'string' },
      ingredients: { type: 'array', items: { type: 'string' } },
      cookingTime: { type: 'number' },
    },
    required: ['recipeName'],
    propertyOrdering: ['recipeName', 'ingredients', 'cookingTime'],
  };

  expect(
    convertJSONSchemaToOpenAPISchema(input, propertyOrderingConfig),
  ).toEqual(expected);
});

it('should preserve custom propertyOrdering order', () => {
  const input: JSONSchema7 = {
    type: 'object',
    properties: {
      id: { type: 'number' },
      name: { type: 'string' },
      email: { type: 'string' },
      age: { type: 'number' },
    },
  };

  // Custom order different from property definition order
  const propertyOrderingConfig: PropertyOrderingConfig = {
    name: null,
    id: null,
    age: null,
    email: null,
  };

  const expected = {
    type: 'object',
    properties: {
      id: { type: 'number' },
      name: { type: 'string' },
      email: { type: 'string' },
      age: { type: 'number' },
    },
    propertyOrdering: ['name', 'id', 'age', 'email'],
  };

  expect(
    convertJSONSchemaToOpenAPISchema(input, propertyOrderingConfig),
  ).toEqual(expected);
});

it('should not add propertyOrdering when configuration is not provided', () => {
  const input: JSONSchema7 = {
    type: 'object',
    properties: {
      id: { type: 'number' },
      name: { type: 'string' },
    },
  };

  const expected = {
    type: 'object',
    properties: {
      id: { type: 'number' },
      name: { type: 'string' },
    },
  };

  expect(convertJSONSchemaToOpenAPISchema(input)).toEqual(expected);
});

it('should not add propertyOrdering for objects without properties', () => {
  const input: JSONSchema7 = {
    type: 'object',
  };

  const propertyOrderingConfig: PropertyOrderingConfig = {
    nonExistent: null,
  };

  const expected = undefined; // This returns undefined for empty object schemas

  expect(
    convertJSONSchemaToOpenAPISchema(input, propertyOrderingConfig),
  ).toEqual(expected);
});

it('should not add propertyOrdering for non-object types', () => {
  const input: JSONSchema7 = {
    type: 'array',
    items: { type: 'string' },
  };

  const propertyOrderingConfig: PropertyOrderingConfig = {
    someProperty: null,
  };

  const expected = {
    type: 'array',
    items: { type: 'string' },
  };

  expect(
    convertJSONSchemaToOpenAPISchema(input, propertyOrderingConfig),
  ).toEqual(expected);
});

it('should ignore properties in configuration that do not exist in schema', () => {
  const input: JSONSchema7 = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      age: { type: 'number' },
    },
  };

  const propertyOrderingConfig: PropertyOrderingConfig = {
    name: null,
    nonExistentProperty: null,
    age: null,
  };

  const expected = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      age: { type: 'number' },
    },
    propertyOrdering: ['name', 'age'], // Only existing properties
  };

  expect(
    convertJSONSchemaToOpenAPISchema(input, propertyOrderingConfig),
  ).toEqual(expected);
});

it('should work with nested property ordering configuration', () => {
  const input: JSONSchema7 = {
    type: 'object',
    properties: {
      user: {
        type: 'object',
        properties: {
          profile: { type: 'string' },
          id: { type: 'number' },
        },
      },
      metadata: {
        type: 'object',
        properties: {
          updatedAt: { type: 'string' },
          createdAt: { type: 'string' },
        },
      },
    },
  };

  const propertyOrderingConfig: PropertyOrderingConfig = {
    user: {
      id: null,
      profile: null,
    },
    metadata: {
      createdAt: null,
      updatedAt: null,
    },
  };

  const expected = {
    type: 'object',
    properties: {
      user: {
        type: 'object',
        properties: {
          profile: { type: 'string' },
          id: { type: 'number' },
        },
        propertyOrdering: ['id', 'profile'],
      },
      metadata: {
        type: 'object',
        properties: {
          updatedAt: { type: 'string' },
          createdAt: { type: 'string' },
        },
        propertyOrdering: ['createdAt', 'updatedAt'],
      },
    },
    propertyOrdering: ['user', 'metadata'],
  };

  expect(
    convertJSONSchemaToOpenAPISchema(input, propertyOrderingConfig),
  ).toEqual(expected);
});

it('should handle mixed null and nested configurations correctly', () => {
  const input: JSONSchema7 = {
    type: 'object',
    properties: {
      simpleProperty: { type: 'string' },
      nestedObject: {
        type: 'object',
        properties: {
          childA: { type: 'string' },
          childB: { type: 'number' },
        },
      },
      anotherSimple: { type: 'boolean' },
    },
  };

  const propertyOrderingConfig: PropertyOrderingConfig = {
    simpleProperty: null, // Leaf property
    nestedObject: {
      // Nested configuration
      childB: null,
      childA: null,
    },
    anotherSimple: null, // Another leaf property
  };

  const expected = {
    type: 'object',
    properties: {
      simpleProperty: { type: 'string' },
      nestedObject: {
        type: 'object',
        properties: {
          childA: { type: 'string' },
          childB: { type: 'number' },
        },
        propertyOrdering: ['childB', 'childA'], // Nested ordering applied
      },
      anotherSimple: { type: 'boolean' },
    },
    propertyOrdering: ['simpleProperty', 'nestedObject', 'anotherSimple'], // Top-level ordering
  };

  expect(
    convertJSONSchemaToOpenAPISchema(input, propertyOrderingConfig),
  ).toEqual(expected);
});

it('should handle deeply nested objects with null leaves', () => {
  const input: JSONSchema7 = {
    type: 'object',
    properties: {
      user: {
        type: 'object',
        properties: {
          id: { type: 'number' },
          profile: {
            type: 'object',
            properties: {
              personal: {
                type: 'object',
                properties: {
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                  email: { type: 'string' },
                },
              },
              preferences: {
                type: 'object',
                properties: {
                  theme: { type: 'string' },
                  language: { type: 'string' },
                  notifications: { type: 'boolean' },
                },
              },
            },
          },
          status: { type: 'string' },
        },
      },
      metadata: {
        type: 'object',
        properties: {
          timestamps: {
            type: 'object',
            properties: {
              createdAt: { type: 'string' },
              updatedAt: { type: 'string' },
              lastLogin: { type: 'string' },
            },
          },
          version: { type: 'number' },
        },
      },
    },
  };

  const propertyOrderingConfig: PropertyOrderingConfig = {
    user: {
      id: null,
      profile: {
        personal: {
          firstName: null,
          lastName: null,
          email: null,
        },
        preferences: {
          theme: null,
          language: null,
          notifications: null,
        },
      },
      status: null,
    },
    metadata: {
      timestamps: {
        createdAt: null,
        updatedAt: null,
        lastLogin: null,
      },
      version: null,
    },
  };

  const expected = {
    type: 'object',
    properties: {
      user: {
        type: 'object',
        properties: {
          id: { type: 'number' },
          profile: {
            type: 'object',
            properties: {
              personal: {
                type: 'object',
                properties: {
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                  email: { type: 'string' },
                },
                propertyOrdering: ['firstName', 'lastName', 'email'],
              },
              preferences: {
                type: 'object',
                properties: {
                  theme: { type: 'string' },
                  language: { type: 'string' },
                  notifications: { type: 'boolean' },
                },
                propertyOrdering: ['theme', 'language', 'notifications'],
              },
            },
            propertyOrdering: ['personal', 'preferences'],
          },
          status: { type: 'string' },
        },
        propertyOrdering: ['id', 'profile', 'status'],
      },
      metadata: {
        type: 'object',
        properties: {
          timestamps: {
            type: 'object',
            properties: {
              createdAt: { type: 'string' },
              updatedAt: { type: 'string' },
              lastLogin: { type: 'string' },
            },
            propertyOrdering: ['createdAt', 'updatedAt', 'lastLogin'],
          },
          version: { type: 'number' },
        },
        propertyOrdering: ['timestamps', 'version'],
      },
    },
    propertyOrdering: ['user', 'metadata'],
  };

  expect(
    convertJSONSchemaToOpenAPISchema(input, propertyOrderingConfig),
  ).toEqual(expected);
});

it('should handle complex e-commerce schema with deeply nested null leaves', () => {
  const input: JSONSchema7 = {
    type: 'object',
    properties: {
      product: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          pricing: {
            type: 'object',
            properties: {
              basePrice: { type: 'number' },
              currency: { type: 'string' },
              discounts: {
                type: 'object',
                properties: {
                  percentage: { type: 'number' },
                  validUntil: { type: 'string' },
                  code: { type: 'string' },
                },
              },
            },
          },
          inventory: {
            type: 'object',
            properties: {
              stock: { type: 'number' },
              warehouse: { type: 'string' },
            },
          },
        },
      },
      customer: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          contact: {
            type: 'object',
            properties: {
              email: { type: 'string' },
              phone: { type: 'string' },
            },
          },
          address: {
            type: 'object',
            properties: {
              street: { type: 'string' },
              city: { type: 'string' },
              zipCode: { type: 'string' },
              country: { type: 'string' },
            },
          },
        },
      },
      orderDate: { type: 'string' },
    },
  };

  const propertyOrderingConfig: PropertyOrderingConfig = {
    orderDate: null,
    customer: {
      id: null,
      contact: {
        email: null,
        phone: null,
      },
      address: {
        street: null,
        city: null,
        zipCode: null,
        country: null,
      },
    },
    product: {
      id: null,
      name: null,
      pricing: {
        basePrice: null,
        currency: null,
        discounts: {
          percentage: null,
          code: null,
          validUntil: null,
        },
      },
      inventory: {
        stock: null,
        warehouse: null,
      },
    },
  };

  const expected = {
    type: 'object',
    properties: {
      product: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          pricing: {
            type: 'object',
            properties: {
              basePrice: { type: 'number' },
              currency: { type: 'string' },
              discounts: {
                type: 'object',
                properties: {
                  percentage: { type: 'number' },
                  validUntil: { type: 'string' },
                  code: { type: 'string' },
                },
                propertyOrdering: ['percentage', 'code', 'validUntil'],
              },
            },
            propertyOrdering: ['basePrice', 'currency', 'discounts'],
          },
          inventory: {
            type: 'object',
            properties: {
              stock: { type: 'number' },
              warehouse: { type: 'string' },
            },
            propertyOrdering: ['stock', 'warehouse'],
          },
        },
        propertyOrdering: ['id', 'name', 'pricing', 'inventory'],
      },
      customer: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          contact: {
            type: 'object',
            properties: {
              email: { type: 'string' },
              phone: { type: 'string' },
            },
            propertyOrdering: ['email', 'phone'],
          },
          address: {
            type: 'object',
            properties: {
              street: { type: 'string' },
              city: { type: 'string' },
              zipCode: { type: 'string' },
              country: { type: 'string' },
            },
            propertyOrdering: ['street', 'city', 'zipCode', 'country'],
          },
        },
        propertyOrdering: ['id', 'contact', 'address'],
      },
      orderDate: { type: 'string' },
    },
    propertyOrdering: ['orderDate', 'customer', 'product'],
  };

  expect(
    convertJSONSchemaToOpenAPISchema(input, propertyOrderingConfig),
  ).toEqual(expected);
});

it('should handle partial property ordering configurations', () => {
  const input: JSONSchema7 = {
    type: 'object',
    properties: {
      id: { type: 'number' },
      name: { type: 'string' },
      email: { type: 'string' },
      profile: {
        type: 'object',
        properties: {
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          age: { type: 'number' },
          avatar: { type: 'string' },
        },
      },
      settings: {
        type: 'object',
        properties: {
          theme: { type: 'string' },
          language: { type: 'string' },
          notifications: { type: 'boolean' },
          privacy: { type: 'string' },
        },
      },
      createdAt: { type: 'string' },
    },
  };

  // Only specify ordering for some properties, not all
  const propertyOrderingConfig: PropertyOrderingConfig = {
    id: null,
    name: null,
    profile: {
      firstName: null,
      lastName: null,
      // Note: age and avatar are not specified, so they won't be in propertyOrdering
    },
    settings: {
      theme: null,
      notifications: null,
      // Note: language and privacy are not specified
    },
    // Note: email and createdAt are not specified at top level
  };

  const expected = {
    type: 'object',
    properties: {
      id: { type: 'number' },
      name: { type: 'string' },
      email: { type: 'string' },
      profile: {
        type: 'object',
        properties: {
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          age: { type: 'number' },
          avatar: { type: 'string' },
        },
        propertyOrdering: ['firstName', 'lastName'], // Only specified properties
      },
      settings: {
        type: 'object',
        properties: {
          theme: { type: 'string' },
          language: { type: 'string' },
          notifications: { type: 'boolean' },
          privacy: { type: 'string' },
        },
        propertyOrdering: ['theme', 'notifications'], // Only specified properties
      },
      createdAt: { type: 'string' },
    },
    propertyOrdering: ['id', 'name', 'profile', 'settings'], // Only specified properties
  };

  expect(
    convertJSONSchemaToOpenAPISchema(input, propertyOrderingConfig),
  ).toEqual(expected);
});
