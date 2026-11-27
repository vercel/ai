import type {
  HarnessV1QuestionsToolInput,
  HarnessV1QuestionsToolOutput,
} from '@ai-sdk/harness';
import type { AskUserQuestionInput } from '@anthropic-ai/claude-agent-sdk/sdk-tools.js';

type ClaudeCodeQuestion = AskUserQuestionInput['questions'][number];

export function claudeCodeQuestionKey(
  nativeInput: AskUserQuestionInput,
): string {
  return JSON.stringify(nativeInput.questions);
}

export function toHarnessQuestionsInput(
  nativeInput: AskUserQuestionInput,
): HarnessV1QuestionsToolInput {
  return {
    allowPartialAnswers: true,
    questions: nativeInput.questions.map((question, questionIndex) => ({
      id: `question-${questionIndex + 1}`,
      question: question.question,
      header: question.header,
      options: question.options.map((option, optionIndex) => ({
        id: `option-${optionIndex + 1}`,
        label: option.label,
        description: option.description,
        ...(option.preview !== undefined ? { preview: option.preview } : {}),
      })),
      allowMultiple: question.multiSelect,
      allowFreeForm: true,
    })),
  };
}

export function toClaudeCodeQuestionResult(input: {
  nativeInput: AskUserQuestionInput;
  output: HarnessV1QuestionsToolOutput;
}):
  | {
      behavior: 'allow';
      updatedInput: AskUserQuestionInput & { answers: Record<string, string> };
    }
  | { behavior: 'deny'; message: string } {
  const output = input.output;
  if (output.action === 'declined' || output.action === 'cancelled') {
    return {
      behavior: 'deny',
      message: `The user ${output.action} the questions.`,
    };
  }

  const canonicalInput = toHarnessQuestionsInput(input.nativeInput);
  const annotations = new Map<string, { notes: string }>();
  const answers = Object.fromEntries(
    canonicalInput.questions.flatMap((question, questionIndex) => {
      const answer = output.answers[question.id];
      if (answer == null) return [];
      const nativeQuestion = input.nativeInput.questions[questionIndex];
      const selectedAnswer = toClaudeCodeAnswer({
        nativeQuestion,
        optionIds: answer.optionIds,
      });
      if (selectedAnswer !== '' && answer.freeform !== undefined) {
        annotations.set(nativeQuestion.question, {
          ...input.nativeInput.annotations?.[nativeQuestion.question],
          notes: answer.freeform,
        });
      }
      return [
        [
          nativeQuestion.question,
          selectedAnswer === '' ? (answer.freeform ?? '') : selectedAnswer,
        ],
      ];
    }),
  );

  return {
    behavior: 'allow',
    updatedInput: {
      ...input.nativeInput,
      answers,
      ...(annotations.size > 0
        ? {
            annotations: {
              ...input.nativeInput.annotations,
              ...Object.fromEntries(annotations),
            },
          }
        : {}),
    },
  };
}

function toClaudeCodeAnswer(input: {
  nativeQuestion: ClaudeCodeQuestion;
  optionIds: string[];
}): string {
  const labels = input.optionIds.flatMap(optionId => {
    const index = positionalIdIndex({ id: optionId, prefix: 'option-' });
    const option =
      index == null ? undefined : input.nativeQuestion.options[index];
    return option == null ? [] : [option.label];
  });
  return input.nativeQuestion.multiSelect
    ? labels.join(', ')
    : (labels[0] ?? '');
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
