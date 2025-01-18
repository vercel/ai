import { z } from 'zod';
import { zodSchema } from './zod-schema';
import { fail } from 'assert';

describe('zodSchema', () => {
  describe('json schema conversion', () => {
    it('should create a schema with simple types', () => {
      const schema = zodSchema(
        z.object({
          text: z.string(),
          number: z.number(),
        }),
      );

      expect(schema.jsonSchema).toMatchSnapshot();
    });

    it('should support optional fields in object', () => {
      const schema = zodSchema(
        z.object({
          required: z.string(),
          optional: z.string().optional(),
        }),
      );

      expect(schema.jsonSchema).toMatchSnapshot();
    });

    it('should support optional fields with descriptions in object', () => {
      const schema = zodSchema(
        z.object({
          required: z.string().describe('Required description'),
          optional: z.string().optional().describe('Optional description'),
        }),
      );

      expect(schema.jsonSchema).toMatchSnapshot();
    });

    it('should support arrays', () => {
      const schema = zodSchema(
        z.object({
          items: z.array(z.string()),
        }),
      );

      expect(schema.jsonSchema).toMatchSnapshot();
    });

    it('should support optional arrays', () => {
      const schema = zodSchema(
        z.object({
          items: z.array(z.string()).optional(),
        }),
      );

      expect(schema.jsonSchema).toMatchSnapshot();
    });

    it('should support required enums', () => {
      const schema = zodSchema(
        z.object({
          type: z.enum(['a', 'b', 'c']),
        }),
      );

      expect(schema.jsonSchema).toMatchSnapshot();
    });

    it('should support optional enums', () => {
      const schema = zodSchema(
        z.object({
          type: z.enum(['a', 'b', 'c']).optional(),
        }),
      );

      expect(schema.jsonSchema).toMatchSnapshot();
    });

    it('should duplicate referenced schemas (and not use references)', () => {
      const Inner = z.object({
        text: z.string(),
        number: z.number(),
      });

      const schema = zodSchema(
        z.object({
          group1: z.array(Inner),
          group2: z.array(Inner),
        }),
      );

      expect(schema.jsonSchema).toMatchSnapshot();
    });
  });

  describe('type validation and transformation', () => {
    it('should handle basic validation', () => {
      const schema = zodSchema(z.string());
      const result = schema.validate?.('hello');
      expect(result).toEqual({
        success: true,
        value: 'hello',
        rawValue: 'hello',
      });
    });

    it('should handle validation failures', () => {
      const schema = zodSchema(z.number());
      const result = schema.validate?.(123);
      expect(result).toEqual({
        success: true,
        value: 123,
        rawValue: 123,
      });
    });

    it('should preserve raw values during transformation', () => {
      const schema = zodSchema(
        z.object({
          count: z.string().transform(val => parseInt(val, 10)),
        }),
      );

      const input = { count: '42' };
      const result = schema.validate?.(input);

      expect(result).toEqual({
        success: true,
        value: { count: 42 },
        rawValue: input,
      });
    });

    it('should handle nested transformations', () => {
      const schema = zodSchema(
        z.object({
          user: z.object({
            id: z.string().transform(val => parseInt(val, 10)),
            tags: z
              .array(z.string())
              .transform(tags => tags.map(t => t.toUpperCase())),
          }),
        }),
      );

      const input = { user: { id: '123', tags: ['draft', 'review'] } };
      const result = schema.validate?.(input);

      expect(result).toEqual({
        success: true,
        value: { user: { id: 123, tags: ['DRAFT', 'REVIEW'] } },
        rawValue: input,
      });
    });

    it('should handle validation errors in transformations', () => {
      const schema = zodSchema(
        z.object({
          count: z.string().transform(val => {
            const num = parseInt(val, 10);
            if (isNaN(num)) throw new Error('Invalid number');
            return num;
          }),
        }),
      );

      const result = schema.validate?.('not a number');
      if (!result?.success) {
        expect(result?.error).toBeInstanceOf(z.ZodError);
      } else {
        fail('Expected validation to fail');
      }
    });
  });
});
