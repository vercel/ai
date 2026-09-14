import type { FunctionTool } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

const harnessV1QuestionSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  header: z.string().optional(),
  options: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        description: z.string().optional(),
        preview: z.string().optional(),
      }),
    )
    .optional(),
  allowMultiple: z.boolean().optional(),
  allowFreeForm: z
    .union([
      z.boolean(),
      z.object({
        secret: z.boolean(),
      }),
    ])
    .optional(),
});

export const harnessV1QuestionsToolInputSchema = z.object({
  allowPartialAnswers: z.boolean(),
  questions: z.array(harnessV1QuestionSchema).min(1),
});

const harnessV1QuestionAnswerSchema = z.object({
  optionIds: z.array(z.string()),
  freeform: z.string().optional(),
});

export const harnessV1QuestionsToolOutputSchema = z.discriminatedUnion(
  'action',
  [
    z.object({
      action: z.literal('answered'),
      answers: z.record(z.string(), harnessV1QuestionAnswerSchema),
    }),
    z.object({
      action: z.literal('partially-answered'),
      answers: z.record(z.string(), harnessV1QuestionAnswerSchema),
    }),
    z.object({ action: z.literal('declined') }),
    z.object({ action: z.literal('cancelled') }),
  ],
);

export type HarnessV1QuestionsToolInput = z.infer<
  typeof harnessV1QuestionsToolInputSchema
>;

export type HarnessV1QuestionsToolOutput = z.infer<
  typeof harnessV1QuestionsToolOutputSchema
>;

export const harnessV1QuestionsTool: FunctionTool<
  HarnessV1QuestionsToolInput,
  HarnessV1QuestionsToolOutput
> = {
  description: 'Ask the user one or more questions',
  inputSchema: harnessV1QuestionsToolInputSchema,
  outputSchema: harnessV1QuestionsToolOutputSchema,
};

export type HarnessV1QuestionsTool = typeof harnessV1QuestionsTool;
