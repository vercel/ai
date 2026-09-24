import {
  harnessV1QuestionsToolOutputSchema,
  type HarnessV1QuestionsToolInput,
} from '@ai-sdk/harness';
import type { ACPAskUserQuestionsSettings } from '@ai-sdk/harness-acp';
import type { ToolResultPart } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

const grokBuildQuestionRequestSchema = z.object({
  sessionId: z.string(),
  toolCallId: z.string(),
  questions: z.array(
    z.object({
      question: z.string(),
      options: z.array(
        z.object({
          label: z.string(),
          description: z.string(),
          preview: z.string().nullable().optional(),
        }),
      ),
      multi_select: z.boolean().nullable().optional(),
    }),
  ),
  mode: z.enum(['default', 'plan']),
});

type GrokBuildQuestionRequest = z.infer<typeof grokBuildQuestionRequestSchema>;

export const grokBuildAskUserQuestions = {
  requestMethod: '_x.ai/ask_user_question',
  fromNativeRequest: ({ nativeRequest }) => {
    const parsed = grokBuildQuestionRequestSchema.safeParse(nativeRequest);
    if (!parsed.success) return null;
    return {
      type: 'tool-call',
      toolCallId: parsed.data.toolCallId,
      toolName: 'askUserQuestions',
      nativeName: 'ask_user_question',
      input: JSON.stringify(toHarnessQuestionsInput(parsed.data)),
      providerExecuted: false,
    };
  },
  toNativeResponse: ({ nativeRequest, toolResult }) => {
    const request = grokBuildQuestionRequestSchema.parse(nativeRequest);
    const output = parseQuestionsOutput(toolResult);
    if (output.action === 'cancelled') {
      return { outcome: 'cancelled' };
    }

    const nativeAnswers =
      output.action === 'declined'
        ? { answers: {}, annotations: {} }
        : toNativeAnswers({ request, output });
    const requestedOutcome =
      toolResult.providerOptions?.['grok-build']?.outcome;
    if (
      requestedOutcome === 'chat_about_this' ||
      requestedOutcome === 'skip_interview'
    ) {
      return {
        outcome: requestedOutcome,
        partial_answers: Object.fromEntries(
          Object.entries(nativeAnswers.answers).map(([question, answers]) => [
            question,
            answers.join(', '),
          ]),
        ),
      };
    }
    if (output.action === 'declined') {
      return { outcome: 'skip_interview', partial_answers: {} };
    }
    return {
      outcome: 'accepted',
      answers: nativeAnswers.answers,
      ...(Object.keys(nativeAnswers.annotations).length === 0
        ? {}
        : { annotations: nativeAnswers.annotations }),
    };
  },
  matchesNativeRequest: ({ previousNativeRequest, nativeRequest }) => {
    const previous = grokBuildQuestionRequestSchema.safeParse(
      previousNativeRequest,
    );
    const current = grokBuildQuestionRequestSchema.safeParse(nativeRequest);
    return (
      previous.success &&
      current.success &&
      questionFingerprint(previous.data) === questionFingerprint(current.data)
    );
  },
} satisfies ACPAskUserQuestionsSettings;

function toHarnessQuestionsInput(
  request: GrokBuildQuestionRequest,
): HarnessV1QuestionsToolInput {
  return {
    allowPartialAnswers: true,
    questions: request.questions.map((question, questionIndex) => ({
      id: questionId(questionIndex),
      question: question.question,
      options: question.options.map((option, optionIndex) => ({
        id: optionId(optionIndex),
        label: option.label,
        description: option.description,
        ...(option.preview == null ? {} : { preview: option.preview }),
      })),
      ...(question.multi_select == null
        ? {}
        : { allowMultiple: question.multi_select }),
      allowFreeForm: true,
    })),
  };
}

function toNativeAnswers({
  request,
  output,
}: {
  request: GrokBuildQuestionRequest;
  output: Extract<
    ReturnType<typeof parseQuestionsOutput>,
    { action: 'answered' | 'partially-answered' }
  >;
}): {
  answers: Record<string, string[]>;
  annotations: Record<string, { preview?: string; notes?: string }>;
} {
  const answers: Record<string, string[]> = {};
  const annotations: Record<string, { preview?: string; notes?: string }> = {};
  request.questions.forEach((question, questionIndex) => {
    const answer = output.answers[questionId(questionIndex)];
    if (answer == null) return;
    const labels = answer.optionIds.flatMap(id => {
      const optionIndex = positionalIdIndex({ id, prefix: 'option-' });
      const option =
        optionIndex == null ? undefined : question.options[optionIndex];
      return option == null ? [] : [option.label];
    });
    if (answer.freeform != null) {
      labels.push('Other');
      annotations[question.question] = { notes: answer.freeform };
    }
    answers[question.question] = labels;
  });
  return { answers, annotations };
}

function parseQuestionsOutput(toolResult: ToolResultPart) {
  if (
    toolResult.output.type !== 'json' &&
    toolResult.output.type !== 'error-json'
  ) {
    throw new Error('Grok Build askUserQuestions requires a JSON tool result.');
  }
  return harnessV1QuestionsToolOutputSchema.parse(toolResult.output.value);
}

function questionId(index: number): string {
  return `question-${index + 1}`;
}

function optionId(index: number): string {
  return `option-${index + 1}`;
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

function questionFingerprint(request: GrokBuildQuestionRequest): string {
  return JSON.stringify({
    questions: request.questions,
    mode: request.mode,
  });
}
