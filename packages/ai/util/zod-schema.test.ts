import { z } from 'zod';
import { zodSchema } from './zod-schema';
import { safeParseJSON } from '@ai-sdk/provider-utils';

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

    it('should duplicate referenced schemas (and not use references) by default', () => {
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

    it('should use references when useReferences is true', () => {
      const Inner = z.object({
        text: z.string(),
        number: z.number(),
      });

      const schema = zodSchema(
        z.object({
          group1: z.array(Inner),
          group2: z.array(Inner),
        }),
        { useReferences: true },
      );

      expect(schema.jsonSchema).toMatchSnapshot();
    });

    it('should use recursive references with z.lazy when useReferences is true', () => {
      const baseCategorySchema = z.object({
        name: z.string(),
      });

      type Category = z.infer<typeof baseCategorySchema> & {
        subcategories: Category[];
      };

      const categorySchema: z.ZodType<Category> = baseCategorySchema.extend({
        subcategories: z.lazy(() => categorySchema.array()),
      });

      const schema = zodSchema(
        z.object({
          category: categorySchema,
        }),
        { useReferences: true },
      );

      expect(schema.jsonSchema).toMatchSnapshot();
    });

    describe('nullable', () => {
      it('should support nullable', () => {
        const schema = zodSchema(
          z.object({
            location: z.string().nullable(),
          }),
        );

        expect(schema.jsonSchema).toMatchSnapshot();
      });
    });
  });

  describe('output validation', () => {
    it('should validate output with transform', () => {
      const schema = zodSchema(
        z.object({
          user: z.object({
            id: z.string().transform(val => parseInt(val, 10)),
            name: z.string(),
          }),
        }),
      );

      const result = safeParseJSON({
        text: '{"user": {"id": "123", "name": "John"}}',
        schema,
      });

      expect(result).toStrictEqual({
        success: true,
        value: { user: { id: 123, name: 'John' } },
        rawValue: { user: { id: '123', name: 'John' } },
      });
    });
  });
});
