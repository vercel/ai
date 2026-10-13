import {
  harnessV1QuestionsToolOutputSchema,
  type HarnessV1QuestionsToolInput,
} from '@ai-sdk/harness';
import type { ACPAskUserQuestionsSettings } from '@ai-sdk/harness-acp';
import type { ToolResultPart } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

const codexQuestionPropertySchema = z.object({
  type: z.literal('string'),
  title: z.string().optional(),
  description: z.string().optional(),
  oneOf: z
    .array(
      z.object({
        const: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
      }),
    )
    .optional(),
  _meta: z
    .object({
      codex: z.object({
        isOther: z.boolean().optional(),
        isSecret: z.boolean().optional(),
        questionId: z.string().optional(),
        isOtherAnswer: z.boolean().optional(),
      }),
    })
    .optional(),
});

const codexQuestionRequestSchema = z.object({
  sessionId: z.string(),
  toolCallId: z.string(),
  mode: z.literal('form'),
  message: z.string(),
  requestedSchema: z.object({
    type: z.literal('object'),
    properties: z.record(z.string(), codexQuestionPropertySchema),
    required: z.array(z.string()),
  }),
  _meta: z.object({
    codex: z.object({
      autoResolutionMs: z.number().nullable(),
    }),
  }),
});

type CodexQuestionRequest = z.infer<typeof codexQuestionRequestSchema>;

export const codexACPAskUserQuestions = {
  requestMethod: 'elicitation/create',
  fromNativeRequest: ({ nativeRequest }) => {
    const parsed = codexQuestionRequestSchema.safeParse(nativeRequest);
    if (!parsed.success) return null;
    return {
      type: 'tool-call',
      toolCallId: parsed.data.toolCallId,
      toolName: 'askUserQuestions',
      input: JSON.stringify(toHarnessQuestionsInput(parsed.data)),
      providerExecuted: false,
    };
  },
  toNativeResponse: ({ nativeRequest, toolResult }) => {
    const request = codexQuestionRequestSchema.parse(nativeRequest);
    const output = parseQuestionsOutput(toolResult);
    if (output.action === 'declined') return { action: 'decline' };
    if (output.action === 'cancelled') return { action: 'cancel' };
    return {
      action: 'accept',
      content: Object.fromEntries(
        toQuestionEntries(request).flatMap(({ id, otherId, property }) => {
          const answer = output.answers[id];
          if (answer == null) return [];
          if (answer.freeform != null && otherId != null) {
            return [[otherId, answer.freeform]];
          }
          const labels = answer.optionIds.flatMap(optionId => {
            const index = positionalIdIndex({
              id: optionId,
              prefix: 'option-',
            });
            const option = index == null ? undefined : property.oneOf?.[index];
            return option == null ? [] : [option.const];
          });
          return [[id, labels.length === 1 ? labels[0] : labels]];
        }),
      ),
    };
  },
  matchesNativeRequest: ({ previousNativeRequest, nativeRequest }) => {
    const previous = codexQuestionRequestSchema.safeParse(
      previousNativeRequest,
    );
    const current = codexQuestionRequestSchema.safeParse(nativeRequest);
    return (
      previous.success &&
      current.success &&
      questionFingerprint(previous.data) === questionFingerprint(current.data)
    );
  },
} satisfies ACPAskUserQuestionsSettings;

function toHarnessQuestionsInput(
  request: CodexQuestionRequest,
): HarnessV1QuestionsToolInput {
  return {
    allowPartialAnswers: true,
    questions: toQuestionEntries(request).map(({ id, property }) => {
      const isSecret = property._meta?.codex.isSecret === true;
      return {
        id,
        question: property.description ?? request.message,
        ...(property.title == null ? {} : { header: property.title }),
        ...(property.oneOf == null
          ? {}
          : {
              options: property.oneOf.map((option, optionIndex) => ({
                id: `option-${optionIndex + 1}`,
                label: option.title ?? option.const,
                ...(option.description == null
                  ? {}
                  : { description: option.description }),
              })),
            }),
        ...(property._meta?.codex.isOther !== true
          ? {}
          : {
              allowFreeForm: isSecret ? { secret: true } : true,
            }),
      };
    }),
  };
}

function toQuestionEntries(request: CodexQuestionRequest) {
  const properties = request.requestedSchema.properties;
  const otherIds = new Map<string, string>();
  for (const [id, property] of Object.entries(properties)) {
    const questionId = property._meta?.codex.questionId;
    if (property._meta?.codex.isOtherAnswer === true && questionId != null) {
      otherIds.set(questionId, id);
    }
  }
  return Object.entries(properties).flatMap(([id, property]) =>
    property._meta?.codex.isOtherAnswer === true
      ? []
      : [{ id, property, otherId: otherIds.get(id) }],
  );
}

function parseQuestionsOutput(toolResult: ToolResultPart) {
  if (
    toolResult.output.type !== 'json' &&
    toolResult.output.type !== 'error-json'
  ) {
    throw new Error('Codex ACP askUserQuestions requires a JSON tool result.');
  }
  return harnessV1QuestionsToolOutputSchema.parse(toolResult.output.value);
}

function positionalIdIndex({
  id,
  prefix,
}: {
  id: string;
  prefix: string;
}): number | undefined {
  if (!id.startsWith(prefix)) return undefined;
  const index = Number(id.slice(prefix.length)) - 1;
  return Number.isInteger(index) && index >= 0 ? index : undefined;
}

function questionFingerprint(request: CodexQuestionRequest): string {
  return JSON.stringify({
    requestedSchema: request.requestedSchema,
    message: request.message,
  });
}
