import {
  harnessV1QuestionsToolOutputSchema,
  type HarnessV1QuestionsToolInput,
} from '@ai-sdk/harness';
import type {
  ACPAskUserQuestionsSettings,
  ACPToolCall,
} from '@ai-sdk/harness-acp';
import type { ToolResultPart } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

const claudeQuestionInputSchema = z.object({
  questions: z.array(
    z.object({
      question: z.string(),
      header: z.string(),
      options: z.array(
        z.object({
          label: z.string(),
          description: z.string(),
          preview: z.string().optional(),
        }),
      ),
      multiSelect: z.boolean(),
    }),
  ),
});

const claudeElicitationRequestSchema = z.object({
  sessionId: z.string(),
  toolCallId: z.string(),
  mode: z.literal('form'),
  message: z.string(),
  requestedSchema: z.object({
    type: z.literal('object'),
    properties: z.record(z.string(), z.unknown()),
  }),
});

type ClaudeQuestionInput = z.infer<typeof claudeQuestionInputSchema>;

export const claudeCodeACPAskUserQuestions = {
  requestMethod: 'elicitation/create',
  isNativeToolCall: ({ nativeToolCall }) =>
    getClaudeToolName(nativeToolCall) === 'AskUserQuestion',
  fromNativeRequest: ({ nativeRequest, nativeToolCall }) => {
    const request = claudeElicitationRequestSchema.safeParse(nativeRequest);
    const input = claudeQuestionInputSchema.safeParse(nativeToolCall?.rawInput);
    if (
      !request.success ||
      !input.success ||
      nativeToolCall?.toolCallId !== request.data.toolCallId ||
      getClaudeToolName(nativeToolCall) !== 'AskUserQuestion'
    ) {
      return null;
    }
    return {
      type: 'tool-call',
      toolCallId: request.data.toolCallId,
      toolName: 'askUserQuestions',
      nativeName: 'AskUserQuestion',
      input: JSON.stringify(toHarnessQuestionsInput(input.data)),
      providerExecuted: false,
      providerMetadata: {
        'claude-code-acp': {
          nativeToolInput: input.data,
        },
      },
    };
  },
  toNativeResponse: ({ nativeRequest, toolResult }) => {
    claudeElicitationRequestSchema.parse(nativeRequest);
    const nativeInput = claudeQuestionInputSchema.parse(
      toolResult.providerOptions?.['claude-code-acp']?.nativeToolInput,
    );
    const output = parseQuestionsOutput(toolResult);
    if (output.action === 'declined') return { action: 'decline' };
    if (output.action === 'cancelled') return { action: 'cancel' };
    return {
      action: 'accept',
      content: Object.fromEntries(
        nativeInput.questions.flatMap((question, questionIndex) => {
          const answer = output.answers[questionId(questionIndex)];
          if (answer == null) return [];
          if (answer.freeform != null) {
            return [[`question_${questionIndex}_custom`, answer.freeform]];
          }
          const labels = answer.optionIds.flatMap(id => {
            const optionIndex = positionalIdIndex({ id, prefix: 'option-' });
            const option =
              optionIndex == null ? undefined : question.options[optionIndex];
            return option == null ? [] : [option.label];
          });
          return [
            [
              `question_${questionIndex}`,
              question.multiSelect ? labels : (labels[0] ?? ''),
            ],
          ];
        }),
      ),
    };
  },
  matchesNativeRequest: ({ previousNativeRequest, nativeRequest }) => {
    const previous = claudeElicitationRequestSchema.safeParse(
      previousNativeRequest,
    );
    const current = claudeElicitationRequestSchema.safeParse(nativeRequest);
    return (
      previous.success &&
      current.success &&
      JSON.stringify({
        message: previous.data.message,
        schema: previous.data.requestedSchema,
      }) ===
        JSON.stringify({
          message: current.data.message,
          schema: current.data.requestedSchema,
        })
    );
  },
} satisfies ACPAskUserQuestionsSettings;

function getClaudeToolName(toolCall: ACPToolCall): string | undefined {
  const metadata = toolCall._meta?.claudeCode;
  const record =
    metadata != null && typeof metadata === 'object' && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : undefined;
  return metadata != null &&
    record != null &&
    typeof record.toolName === 'string'
    ? record.toolName
    : undefined;
}

function toHarnessQuestionsInput(
  input: ClaudeQuestionInput,
): HarnessV1QuestionsToolInput {
  return {
    allowPartialAnswers: true,
    questions: input.questions.map((question, questionIndex) => ({
      id: questionId(questionIndex),
      question: question.question,
      header: question.header,
      options: question.options.map((option, optionIndex) => ({
        id: `option-${optionIndex + 1}`,
        label: option.label,
        description: option.description,
        ...(option.preview == null ? {} : { preview: option.preview }),
      })),
      allowMultiple: question.multiSelect,
      allowFreeForm: true,
    })),
  };
}

function parseQuestionsOutput(toolResult: ToolResultPart) {
  if (
    toolResult.output.type !== 'json' &&
    toolResult.output.type !== 'error-json'
  ) {
    throw new Error(
      'Claude Code ACP askUserQuestions requires a JSON tool result.',
    );
  }
  return harnessV1QuestionsToolOutputSchema.parse(toolResult.output.value);
}

function questionId(index: number): string {
  return `question-${index + 1}`;
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
