import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import * as z4 from 'zod/v4';
import { safeParseJSON } from './parse-json';
import { standardSchema, zodSchema } from './schema';
import { type } from 'arktype';

describe('zodSchema', () => {
  describe('zod/v4', () => {
    describe('json schema conversion', () => {
      it('should create a schema with simple types', () => {
        const schema = zodSchema(
          z4.object({
            text: z4.string(),
            number: z4.number(),
          }),
        );

        expect(schema.jsonSchema).toMatchSnapshot();
      });

      it('should support optional fields in object', () => {
        const schema = zodSchema(
          z4.object({
            required: z4.string(),
            optional: z4.string().optional(),
          }),
        );

        expect(schema.jsonSchema).toMatchSnapshot();
      });

      it('should support optional fields with descriptions in object', () => {
        const schema = zodSchema(
          z4.object({
            required: z4.string().describe('Required description'),
            optional: z4.string().optional().describe('Optional description'),
          }),
        );

        expect(schema.jsonSchema).toMatchSnapshot();
      });

      it('should support arrays', () => {
        const schema = zodSchema(
          z4.object({
            items: z4.array(z4.string()),
          }),
        );

        expect(schema.jsonSchema).toMatchSnapshot();
      });

      it('should support optional arrays', () => {
        const schema = zodSchema(
          z4.object({
            items: z4.array(z4.string()).optional(),
          }),
        );

        expect(schema.jsonSchema).toMatchSnapshot();
      });

      it('should support required enums', () => {
        const schema = zodSchema(
          z4.object({
            type: z4.enum(['a', 'b', 'c']),
          }),
        );

        expect(schema.jsonSchema).toMatchSnapshot();
      });

      it('should support optional enums', () => {
        const schema = zodSchema(
          z4.object({
            type: z4.enum(['a', 'b', 'c']).optional(),
          }),
        );

        expect(schema.jsonSchema).toMatchSnapshot();
      });

      it('should duplicate referenced schemas (and not use references) by default', () => {
        const Inner = z4.object({
          text: z4.string(),
          number: z4.number(),
        });

        const schema = zodSchema(
          z4.object({
            group1: z4.array(Inner),
            group2: z4.array(Inner),
          }),
        );

        expect(schema.jsonSchema).toMatchSnapshot();
      });

      it('should use references when useReferences is true', () => {
        const Inner = z4.object({
          text: z4.string(),
          number: z4.number(),
        });

        const schema = zodSchema(
          z4.object({
            group1: z4.array(Inner),
            group2: z4.array(Inner),
          }),
          { useReferences: true },
        );

        expect(schema.jsonSchema).toMatchSnapshot();
      });

      it('should use recursive references with z.lazy when useReferences is true', () => {
        const baseCategorySchema = z4.object({
          name: z4.string(),
        });

        type Category = z4.infer<typeof baseCategorySchema> & {
          subcategories: Category[];
        };

        const categorySchema: z4.ZodType<Category> = baseCategorySchema.extend({
          subcategories: z4.lazy(() => categorySchema.array()),
        });

        const schema = zodSchema(
          z4.object({
            category: categorySchema,
          }),
          { useReferences: true },
        );

        expect(schema.jsonSchema).toMatchSnapshot();
      });

      describe('nullable', () => {
        it('should support nullable', () => {
          const schema = zodSchema(
            z4.object({
              location: z4.string().nullable(),
            }),
          );

          expect(schema.jsonSchema).toMatchSnapshot();
        });
      });

      describe('z4 schema', () => {
        it('generates correct JSON SChema for z4 and .literal and .enum', () => {
          const schema = zodSchema(
            z4.object({
              text: z4.literal('hello'),
              number: z4.enum(['one', 'two', 'three']),
            }),
          );

          expect(schema.jsonSchema).toMatchSnapshot();
        });
      });
    });

    describe('output validation', () => {
      it('should validate output with transform', async () => {
        const schema = zodSchema(
          z4.object({
            user: z4.object({
              id: z4
                .string()
                .transform(val => parseInt(val, 10))
                .pipe(z4.number()),
              name: z4.string(),
            }),
          }),
        );

        const result = await safeParseJSON({
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
});

describe('standardSchema', () => {
  describe('arktype', () => {
    it('should create a schema with simple types', async () => {
      const schema = standardSchema(
        type({
          text: 'string',
          number: 'number',
        }),
      );

      expect(await schema.jsonSchema).toMatchSnapshot();
    });
  });

  describe('valibot', () => {
    it('should create a schema with simple types', async () => {
      const schema = standardSchema(
        v.object({
          text: v.string(),
          number: v.number(),
        }),
      );

      expect(await schema.jsonSchema).toMatchSnapshot();
    });
  });
});
