import { generateObject, streamObject } from 'ai';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { describeIfCapability } from '../capability-test-utils';
import type { TestFunction } from './index';

export const run: TestFunction<'objectGeneration'> = ({
  model,
  capabilities,
  skipUsage,
}) => {
  describeIfCapability(
    capabilities,
    ['objectGeneration'],
    'Object Generation',
    () => {
      it('should generate basic blog metadata', async () => {
        const result = await generateObject({
          model,
          schema: z.object({
            title: z.string(),
            tags: z.array(z.string()),
          }),
          prompt: 'Generate metadata for a blog post about TypeScript.',
        });

        expect(result.object.title).toBeTruthy();
        expect(Array.isArray(result.object.tags)).toBe(true);
        if (!skipUsage) {
          expect(result.usage?.totalTokens).toBeGreaterThan(0);
        }
      });

      it('should stream RPG character list', async () => {
        const result = streamObject({
          model,
          schema: z.object({
            characters: z.array(
              z.object({
                name: z.string(),
                class: z
                  .string()
                  .describe('Character class, e.g. warrior, mage, or thief.'),
                description: z.string(),
              }),
            ),
          }),
          prompt: 'Generate 3 RPG character descriptions.',
        });

        const parts = [];
        for await (const part of result.partialObjectStream) {
          parts.push(part);
        }

        expect(parts.length).toBeGreaterThan(0);
        if (!skipUsage) {
          expect((await result.usage).totalTokens).toBeGreaterThan(0);
        }
      });

      it('should generate a simple object', async () => {
        const result = await generateObject({
          model,
          schema: z.object({
            name: z.string(),
            age: z.number(),
          }),
          prompt: 'Generate details for a person.',
        });

        expect(result.object.name).toBeTruthy();
        expect(typeof result.object.age).toBe('number');
        if (!skipUsage) {
          expect(result.usage?.totalTokens).toBeGreaterThan(0);
        }
      });

      it('should generate multiple simple items', async () => {
        const result = await generateObject({
          model,
          schema: z.object({
            items: z
              .array(
                z.object({
                  name: z.string(),
                  quantity: z.number(),
                }),
              )
              .length(3),
          }),
          prompt: 'Generate a shopping list with 3 items.',
        });

        expect(result.object.items).toHaveLength(3);
        expect(result.object.items[0].name).toBeTruthy();
        expect(typeof result.object.items[0].quantity).toBe('number');
      });

      it('should generate nested objects', async () => {
        const result = await generateObject({
          model,
          schema: z.object({
            user: z.object({
              name: z.string(),
              contact: z.object({
                email: z.string(),
                phone: z.string(),
              }),
            }),
            preferences: z.object({
              theme: z.enum(['light', 'dark']),
              notifications: z.boolean(),
            }),
          }),
          prompt:
            'Generate a user profile with contact details and preferences.',
        });

        expect(typeof result.object.user.name).toBe('string');
        expect(typeof result.object.user.contact.email).toBe('string');
        expect(typeof result.object.user.contact.phone).toBe('string');
        expect(['light', 'dark']).toContain(result.object.preferences.theme);
        expect(typeof result.object.preferences.notifications).toBe('boolean');
      });

      it('should generate arrays of objects', async () => {
        const result = await generateObject({
          model,
          schema: z.object({
            posts: z
              .array(
                z.object({
                  title: z.string(),
                  comments: z
                    .array(
                      z.object({
                        author: z.string(),
                        text: z.string(),
                      }),
                    )
                    .min(1),
                }),
              )
              .min(2),
          }),
          prompt: 'Generate a blog with multiple posts and comments.',
        });

        expect(result.object.posts.length).toBeGreaterThanOrEqual(2);
        expect(result.object.posts[0].comments.length).toBeGreaterThanOrEqual(
          1,
        );
      });

      it('should handle cross-referenced schemas', async () => {
        const BaseProduct = z.object({
          name: z.string(),
          category: z.string(),
          usage_instructions: z.string(),
        });

        const MorningProduct = BaseProduct.extend({
          morning_specific_instructions: z.string(),
        });

        const EveningProduct = BaseProduct.extend({
          evening_specific_instructions: z.string(),
        });

        const result = await generateObject({
          model,
          schema: z.object({
            morning_routine: z.array(MorningProduct),
            evening_routine: z.array(EveningProduct),
            notes: z.string(),
          }),
          prompt:
            'Generate a skincare routine with morning and evening products.',
        });

        expect(result.object.morning_routine.length).toBeGreaterThan(0);
        expect(result.object.evening_routine.length).toBeGreaterThan(0);
        expect(
          result.object.morning_routine[0].morning_specific_instructions,
        ).toBeTruthy();
        expect(
          result.object.evening_routine[0].evening_specific_instructions,
        ).toBeTruthy();
      });

      it('should handle equivalent flat schemas', async () => {
        const result = await generateObject({
          model,
          schema: z.object({
            morning_routine: z.array(
              z.object({
                name: z.string(),
                category: z.string(),
                usage_instructions: z.string(),
                morning_specific_instructions: z.string(),
              }),
            ),
            evening_routine: z.array(
              z.object({
                name: z.string(),
                category: z.string(),
                usage_instructions: z.string(),
                evening_specific_instructions: z.string(),
              }),
            ),
            notes: z.string(),
          }),
          prompt:
            'Generate a skincare routine with morning and evening products.',
        });

        expect(result.object.morning_routine.length).toBeGreaterThan(0);
        expect(result.object.evening_routine.length).toBeGreaterThan(0);
        expect(
          result.object.morning_routine[0].morning_specific_instructions,
        ).toBeTruthy();
        expect(
          result.object.evening_routine[0].evening_specific_instructions,
        ).toBeTruthy();
      });

      it('should stream complex nested objects', async () => {
        const result = streamObject({
          model,
          schema: z.object({
            chapters: z.array(
              z.object({
                title: z.string(),
                sections: z.array(
                  z.object({
                    heading: z.string(),
                    content: z.string(),
                    subsections: z.array(
                      z.object({
                        title: z.string(),
                        paragraphs: z.array(z.string()),
                      }),
                    ),
                  }),
                ),
              }),
            ),
          }),
          prompt:
            'Generate a book outline with chapters, sections, and subsections.',
        });

        const parts = [];
        for await (const part of result.partialObjectStream) {
          parts.push(part);
        }

        const finalResult = await result.object;
        expect(finalResult.chapters.length).toBeGreaterThan(0);
        expect(finalResult.chapters[0].sections.length).toBeGreaterThan(0);
        expect(parts.length).toBeGreaterThan(0);
      });

      describe('Schema and Prompt Variations', () => {
        it('should generate with field descriptions', async () => {
          const result = await generateObject({
            model,
            schema: z.object({
              title: z.string().describe('A catchy title for the article'),
              summary: z
                .string()
                .describe('A 2-3 sentence overview of the main points'),
              readingTime: z
                .number()
                .describe('Estimated reading time in minutes'),
              targetAudience: z
                .array(z.string())
                .describe('The intended reader groups'),
            }),
            prompt: 'Generate metadata for a technical article.',
          });

          expect(result.object.title).toBeTruthy();
          expect(result.object.summary.length).toBeGreaterThan(50);
        });

        it('should handle detailed system prompts', async () => {
          const result = await generateObject({
            model,
            schema: z.object({
              recipe: z.object({
                name: z.string(),
                ingredients: z.array(z.string()),
                steps: z.array(z.string()),
              }),
            }),
            messages: [
              {
                role: 'system',
                content:
                  'You are a professional chef. Always provide detailed, precise cooking instructions.',
              },
              { role: 'user', content: 'Create a pasta recipe.' },
            ],
          });

          expect(result.object.recipe.steps.length).toBeGreaterThan(3);
          expect(result.object.recipe.ingredients.length).toBeGreaterThan(3);
        });

        it('should generate complex objects with both descriptions and system context', async () => {
          const ProductSchema = z.object({
            name: z
              .string()
              .describe('Product name, should be unique and memorable'),
            price: z
              .number()
              .describe('Price in USD, should be competitive for market'),
            features: z
              .array(z.string())
              .describe('Key selling points, 3-5 items'),
            marketingPlan: z
              .object({
                targetMarket: z
                  .string()
                  .describe('Primary customer demographic'),
                channels: z
                  .array(z.string())
                  .describe('Marketing channels to use'),
                budget: z.number().describe('Proposed marketing budget in USD'),
              })
              .describe('Marketing strategy details'),
          });

          const result = await generateObject({
            model,
            schemaName: 'product',
            schemaDescription: 'A product listing',
            schema: ProductSchema,
            messages: [
              {
                role: 'system',
                content:
                  'You are a senior product manager with 15 years of experience in tech products.',
              },
              {
                role: 'user',
                content: 'Create a product plan for a new smart home device.',
              },
            ],
          });

          expect(result.object.features.length).toBeGreaterThanOrEqual(3);
          expect(result.object.marketingPlan.budget).toBeGreaterThan(0);
          expect(result.object.price).toBeGreaterThan(0);
        });
      });
    },
  );
};
