import { z } from 'zod';

// Define the schema for moderation categories
export const openaiModerationCategoriesSchema = z.object({
  /**
   * General harassment content that expresses, incites, or promotes harassing language
   */
  harassment: z.boolean(),
  /**
   * Harassment content that threatens or intimidates
   */
  'harassment/threatening': z.boolean(),
  /**
   * Hate content that expresses, incites, or promotes hate based on identity
   */
  hate: z.boolean(),
  /**
   * Hateful content that also threatens or intimidates
   */
  'hate/threatening': z.boolean(),
  /**
   * Content that promotes, encourages, or depicts acts of self-harm
   */
  'self-harm': z.boolean(),
  /**
   * Content that encourages or promotes self-harm
   */
  'self-harm/instructions': z.boolean(),
  /**
   * Content that expresses intention to engage in self-harm
   */
  'self-harm/intent': z.boolean(),
  /**
   * Content meant to arouse sexual interest or sexually explicit content
   */
  sexual: z.boolean(),
  /**
   * Sexual content that includes an individual who is under 18 years old
   */
  'sexual/minors': z.boolean(),
  /**
   * Content that depicts, promotes, or glorifies violence
   */
  violence: z.boolean(),
  /**
   * Content that depicts death, violence, or serious physical injury in graphic detail
   */
  'violence/graphic': z.boolean(),
  /**
   * Content related to illegal activities
   */
  illicit: z.boolean().nullable(),
  /**
   * Content related to violent illegal activities
   */
  'illicit/violent': z.boolean().nullable(),
});

// Define the schema for moderation category scores
export const openaiModerationCategoryScoresSchema = z.object({
  harassment: z.number(),
  'harassment/threatening': z.number(),
  hate: z.number(),
  'hate/threatening': z.number(),
  'self-harm': z.number(),
  'self-harm/instructions': z.number(),
  'self-harm/intent': z.number(),
  sexual: z.number(),
  'sexual/minors': z.number(),
  violence: z.number(),
  'violence/graphic': z.number(),
  illicit: z.number(),
  'illicit/violent': z.number(),
});

// Define the schema for category applied input types
export const openaiModerationCategoryAppliedInputTypesSchema = z.object({
  harassment: z.array(z.literal('text')).optional(),
  'harassment/threatening': z.array(z.literal('text')).optional(),
  hate: z.array(z.literal('text')).optional(),
  'hate/threatening': z.array(z.literal('text')).optional(),
  illicit: z.array(z.literal('text')).optional(),
  'illicit/violent': z.array(z.literal('text')).optional(),
  'self-harm': z.array(z.union([z.literal('text'), z.literal('image')])).optional(),
  'self-harm/instructions': z.array(z.union([z.literal('text'), z.literal('image')])).optional(),
  'self-harm/intent': z.array(z.union([z.literal('text'), z.literal('image')])).optional(),
  sexual: z.array(z.union([z.literal('text'), z.literal('image')])).optional(),
  'sexual/minors': z.array(z.literal('text')).optional(),
  violence: z.array(z.union([z.literal('text'), z.literal('image')])).optional(),
  'violence/graphic': z.array(z.union([z.literal('text'), z.literal('image')])).optional(),
}).optional();

// Define the schema for a single moderation result
export const openaiModerationResultSchema = z.object({
  flagged: z.boolean(),
  categories: openaiModerationCategoriesSchema,
  category_scores: openaiModerationCategoryScoresSchema,
  category_applied_input_types: openaiModerationCategoryAppliedInputTypesSchema,
});

// Define the schema for the moderation response
export const openaiModerationResponseSchema = z.object({
  id: z.string(),
  model: z.string(),
  results: z.array(openaiModerationResultSchema),
});

// Define TypeScript types from the schemas
export type OpenAIModerationCategories = z.infer<
  typeof openaiModerationCategoriesSchema
>;
export type OpenAIModerationCategoryScores = z.infer<
  typeof openaiModerationCategoryScoresSchema
>;
export type OpenAIModerationCategoryAppliedInputTypes = z.infer<
  typeof openaiModerationCategoryAppliedInputTypesSchema
>;
export type OpenAIModerationResult = z.infer<
  typeof openaiModerationResultSchema
>;
export type OpenAIModerationResponse = z.infer<
  typeof openaiModerationResponseSchema
>;
