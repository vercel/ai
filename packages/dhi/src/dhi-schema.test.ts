import { describe, expect, it, vi } from 'vitest';
import * as z4 from 'zod/v4';
import { dhiSchema } from './dhi-schema';

describe('dhiSchema', () => {
  describe('with dhi schemas', () => {
    it('should validate successfully with valid data', async () => {
      const mockSchema = {
        safeParse: vi.fn().mockReturnValue({
          success: true,
          data: { name: 'John', age: 30 },
        }),
        parse: vi.fn().mockReturnValue({ name: 'John', age: 30 }),
        toJsonSchema: vi.fn().mockReturnValue({
          type: 'object',
          properties: {
            name: { type: 'string' },
            age: { type: 'number' },
          },
        }),
      };

      const schema = dhiSchema(mockSchema);
      const result = await schema.validate!({ name: 'John', age: 30 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual({ name: 'John', age: 30 });
      }
      expect(mockSchema.safeParse).toHaveBeenCalledWith({
        name: 'John',
        age: 30,
      });
    });

    it('should return error for invalid data', async () => {
      const mockError = new Error('Validation failed');
      const mockSchema = {
        safeParse: vi.fn().mockReturnValue({
          success: false,
          error: mockError,
        }),
        parse: vi.fn().mockImplementation(() => {
          throw mockError;
        }),
        toJsonSchema: vi.fn().mockReturnValue({
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
        }),
      };

      const schema = dhiSchema(mockSchema);
      const result = await schema.validate!({ name: 123 });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(mockError);
      }
    });

    it('should use dhi toJsonSchema() method', async () => {
      const mockJsonSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name', 'age'],
      };

      const mockSchema = {
        safeParse: vi.fn(),
        parse: vi.fn(),
        toJsonSchema: vi.fn().mockReturnValue(mockJsonSchema),
      };

      const schema = dhiSchema(mockSchema);
      const jsonSchema = await schema.jsonSchema;

      expect(jsonSchema).toEqual(mockJsonSchema);
      expect(mockSchema.toJsonSchema).toHaveBeenCalled();
    });
  });

  describe('with zod schemas', () => {
    it('should validate successfully with valid data', async () => {
      const zodSchema = z4.object({
        name: z4.string(),
        age: z4.number(),
      });

      const schema = dhiSchema(zodSchema);
      const result = await schema.validate!({ name: 'John', age: 30 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual({ name: 'John', age: 30 });
      }
    });

    it('should return error for invalid data', async () => {
      const zodSchema = z4.object({
        name: z4.string(),
        age: z4.number(),
      });

      const schema = dhiSchema(zodSchema);
      const result = await schema.validate!({ name: 123, age: 'not a number' });

      expect(result.success).toBe(false);
    });

    it('should generate JSON schema from zod schema', async () => {
      const zodSchema = z4.object({
        name: z4.string(),
        age: z4.number(),
      });

      const schema = dhiSchema(zodSchema);
      const jsonSchema = await schema.jsonSchema;

      expect(jsonSchema).toMatchObject({
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
      });
    });
  });

  describe('error handling', () => {
    it('should throw error for unsupported schema types', async () => {
      const unsupportedSchema = {
        safeParse: vi.fn(),
        parse: vi.fn(),
        // No toJsonSchema and no _zod marker
      };

      const schema = dhiSchema(unsupportedSchema);

      await expect(async () => {
        await schema.jsonSchema;
      }).rejects.toThrow('Schema must be either a dhi schema');
    });
  });
});
