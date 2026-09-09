import type {
  HarnessV1QuestionsToolInput,
  HarnessV1QuestionsToolOutput,
} from '@ai-sdk/harness';
import type { QuestionInfo } from '@opencode-ai/sdk/v2';

export type OpenCodeQuestionRequest = {
  id: string;
  sessionID: string;
  questions: QuestionInfo[];
  tool?: { messageID: string; callID: string };
};

export function openCodeQuestionKey(
  nativeRequest: OpenCodeQuestionRequest,
): string {
  return JSON.stringify(nativeRequest.questions);
}

export function toHarnessQuestionsInput(
  nativeRequest: OpenCodeQuestionRequest,
): HarnessV1QuestionsToolInput {
  return {
    allowPartialAnswers: true,
    questions: nativeRequest.questions.map((question, questionIndex) => ({
      id: `question-${questionIndex + 1}`,
      question: question.question,
      header: question.header,
      options: question.options.map((option, optionIndex) => ({
        id: `option-${optionIndex + 1}`,
        label: option.label,
        description: option.description,
      })),
      ...(question.multiple !== undefined
        ? { allowMultiple: question.multiple }
        : {}),
      ...(question.custom !== undefined
        ? { allowFreeForm: question.custom }
        : {}),
    })),
  };
}

export function toOpenCodeQuestionResponse(input: {
  nativeRequest: OpenCodeQuestionRequest;
  output: HarnessV1QuestionsToolOutput;
}): { action: 'reply'; answers: string[][] } | { action: 'reject' } {
  if (
    input.output.action === 'declined' ||
    input.output.action === 'cancelled'
  ) {
    return { action: 'reject' };
  }

  const answers = input.nativeRequest.questions.map(
    (nativeQuestion, questionIndex) => {
      const answer =
        input.output.action === 'answered' ||
        input.output.action === 'partially-answered'
          ? input.output.answers[`question-${questionIndex + 1}`]
          : undefined;
      if (answer == null) return [];
      const selectedLabels = answer.optionIds.flatMap(optionId => {
        const index = positionalIdIndex({
          id: optionId,
          prefix: 'option-',
        });
        const option =
          index == null ? undefined : nativeQuestion.options[index];
        return option == null ? [] : [option.label];
      });
      return answer.freeform === undefined
        ? selectedLabels
        : [...selectedLabels, answer.freeform];
    },
  );

  return { action: 'reply', answers };
}

function positionalIdIndex(input: {
  id: string;
  prefix: string;
}): number | undefined {
  if (!input.id.startsWith(input.prefix)) return undefined;
  const oneBasedIndex = Number(input.id.slice(input.prefix.length));
  return Number.isInteger(oneBasedIndex) && oneBasedIndex > 0
    ? oneBasedIndex - 1
    : undefined;
}
