'use client';

import HarnessToolView from '@/components/tool/harness-tool-view';
import type {
  HarnessV1QuestionsTool,
  HarnessV1QuestionsToolOutput,
} from '@ai-sdk/harness';
import { useRef, useState, type FormEvent } from 'react';
import type { UIToolInvocation } from 'ai';

type QuestionAnswer = Extract<
  HarnessV1QuestionsToolOutput,
  { action: 'answered' }
>['answers'][string];

export default function AskUserQuestionsToolView({
  invocation,
  onResponse,
}: {
  invocation: UIToolInvocation<HarnessV1QuestionsTool>;
  onResponse: (response: {
    toolCallId: string;
    output: HarnessV1QuestionsToolOutput;
  }) => void;
}) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, QuestionAnswer>>({});
  const [skippedQuestionIds, setSkippedQuestionIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [submitted, setSubmitted] = useState(false);
  const submissionStarted = useRef(false);

  if (invocation.state !== 'input-available') {
    return (
      <HarnessToolView
        toolName="Ask user questions"
        state={invocation.state}
        output={
          invocation.state === 'output-available'
            ? outputSummary(invocation.output)
            : undefined
        }
        errorText={invocation.errorText}
      />
    );
  }

  const { questions, allowPartialAnswers } = invocation.input;
  const currentQuestion = questions[currentQuestionIndex];
  if (currentQuestion == null) {
    return (
      <HarnessToolView toolName="Ask user questions" state={invocation.state} />
    );
  }

  const currentAnswer = answers[currentQuestion.id] ?? { optionIds: [] };
  const isLastQuestion = currentQuestionIndex === questions.length - 1;
  const canSkip = questions.length > 1 && allowPartialAnswers;
  const currentQuestionAnswered = hasAnswer(currentAnswer);
  const currentQuestionSkipped = skippedQuestionIds.has(currentQuestion.id);

  const respond = (output: HarnessV1QuestionsToolOutput) => {
    if (submissionStarted.current) return;
    submissionStarted.current = true;
    setSubmitted(true);
    onResponse({ toolCallId: invocation.toolCallId, output });
  };

  const submitAnswers = (nextAnswers: Record<string, QuestionAnswer>) => {
    const normalizedAnswers = Object.fromEntries(
      questions.flatMap(question => {
        const answer = nextAnswers[question.id];
        if (answer == null || !hasAnswer(answer)) return [];
        return [
          [
            question.id,
            {
              optionIds: answer.optionIds,
              ...(answer.freeform != null && answer.freeform.trim().length > 0
                ? { freeform: answer.freeform }
                : {}),
            },
          ],
        ];
      }),
    );
    const answeredQuestionCount = Object.keys(normalizedAnswers).length;

    respond(
      answeredQuestionCount === 0
        ? { action: 'declined' }
        : answeredQuestionCount === questions.length
          ? { action: 'answered', answers: normalizedAnswers }
          : { action: 'partially-answered', answers: normalizedAnswers },
    );
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      submitted ||
      (!currentQuestionAnswered && !(isLastQuestion && currentQuestionSkipped))
    ) {
      return;
    }

    if (isLastQuestion) {
      submitAnswers(answers);
    } else {
      setCurrentQuestionIndex(index => index + 1);
    }
  };

  const handleSkip = () => {
    if (!canSkip || submitted) return;

    setAnswers(currentAnswers => {
      const nextAnswers = { ...currentAnswers };
      delete nextAnswers[currentQuestion.id];
      return nextAnswers;
    });
    setSkippedQuestionIds(currentIds => {
      const nextIds = new Set(currentIds);
      nextIds.add(currentQuestion.id);
      return nextIds;
    });

    if (!isLastQuestion) {
      setCurrentQuestionIndex(index => index + 1);
    }
  };

  const setCurrentAnswer = (answer: QuestionAnswer) => {
    setSkippedQuestionIds(currentIds => {
      if (!currentIds.has(currentQuestion.id)) return currentIds;
      const nextIds = new Set(currentIds);
      nextIds.delete(currentQuestion.id);
      return nextIds;
    });
    setAnswers(currentAnswers => ({
      ...currentAnswers,
      [currentQuestion.id]: answer,
    }));
  };

  return (
    <div className="relative p-4 mb-3 ml-4 max-w-xl rounded-lg border border-gray-300">
      <button
        type="button"
        aria-label="Cancel questions"
        title="Cancel"
        className="absolute top-2 right-2 flex items-center justify-center w-6 h-6 text-lg leading-none text-gray-400 rounded hover:text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed"
        disabled={submitted}
        onClick={() => respond({ action: 'cancelled' })}
      >
        <span aria-hidden>×</span>
      </button>

      <div className="pr-8">
        <div className="mb-1 text-xs text-gray-500">
          Question {currentQuestionIndex + 1} of {questions.length}
        </div>
        {currentQuestion.header != null && (
          <div className="mb-1 text-sm font-semibold">
            {currentQuestion.header}
          </div>
        )}
        <div className="mb-3 text-sm">{currentQuestion.question}</div>
      </div>

      <form onSubmit={handleSubmit}>
        {currentQuestion.options != null &&
          currentQuestion.options.length > 0 && (
            <fieldset className="flex flex-col gap-2 mb-3">
              <legend className="sr-only">{currentQuestion.question}</legend>
              {currentQuestion.options.map(option => {
                const inputId = `${invocation.toolCallId}-${currentQuestion.id}-${option.id}`;
                const selected = currentAnswer.optionIds.includes(option.id);
                return (
                  <label
                    key={option.id}
                    htmlFor={inputId}
                    className="flex gap-2 items-start p-2 text-sm rounded border border-gray-200 cursor-pointer"
                  >
                    <input
                      id={inputId}
                      type={
                        currentQuestion.allowMultiple ? 'checkbox' : 'radio'
                      }
                      name={`${invocation.toolCallId}-${currentQuestion.id}`}
                      className="mt-0.5"
                      checked={selected}
                      disabled={submitted}
                      onChange={() => {
                        if (currentQuestion.allowMultiple) {
                          setCurrentAnswer({
                            ...currentAnswer,
                            optionIds: selected
                              ? currentAnswer.optionIds.filter(
                                  optionId => optionId !== option.id,
                                )
                              : [...currentAnswer.optionIds, option.id],
                          });
                        } else {
                          setCurrentAnswer({ optionIds: [option.id] });
                        }
                      }}
                    />
                    <span>
                      <span className="font-medium">{option.label}</span>
                      {option.description != null && (
                        <span className="block text-xs text-gray-500">
                          {option.description}
                        </span>
                      )}
                      {option.preview != null && (
                        <pre className="overflow-x-auto p-2 mt-1 text-xs whitespace-pre-wrap bg-gray-100 rounded">
                          {option.preview}
                        </pre>
                      )}
                    </span>
                  </label>
                );
              })}
            </fieldset>
          )}

        {currentQuestion.allowFreeForm && (
          <div className="mb-3">
            <label
              className="block mb-1 text-xs text-gray-500"
              htmlFor={`${invocation.toolCallId}-${currentQuestion.id}-freeform`}
            >
              Other answer
            </label>
            <input
              id={`${invocation.toolCallId}-${currentQuestion.id}-freeform`}
              type={
                typeof currentQuestion.allowFreeForm === 'object' &&
                currentQuestion.allowFreeForm.secret
                  ? 'password'
                  : 'text'
              }
              autoComplete="off"
              className="px-2 py-1 w-full text-sm rounded border border-gray-300"
              value={currentAnswer.freeform ?? ''}
              disabled={submitted}
              onChange={event =>
                setCurrentAnswer({
                  optionIds: currentQuestion.allowMultiple
                    ? currentAnswer.optionIds
                    : [],
                  ...(event.target.value.length > 0
                    ? { freeform: event.target.value }
                    : {}),
                })
              }
            />
          </div>
        )}

        <div className="flex gap-2 justify-end">
          {canSkip && (
            <button
              type="button"
              className="px-3 py-1.5 text-xs text-gray-600 rounded border border-gray-300 disabled:cursor-not-allowed disabled:text-gray-400"
              disabled={submitted}
              onClick={handleSkip}
            >
              Skip
            </button>
          )}
          <button
            type="submit"
            className="px-3 py-1.5 text-xs text-white bg-blue-600 rounded disabled:cursor-not-allowed disabled:bg-gray-400"
            disabled={
              submitted ||
              (!currentQuestionAnswered &&
                !(isLastQuestion && currentQuestionSkipped))
            }
          >
            {isLastQuestion ? 'Submit' : 'Continue'}
          </button>
        </div>
      </form>
    </div>
  );
}

function hasAnswer(answer: QuestionAnswer): boolean {
  return (
    answer.optionIds.length > 0 ||
    (answer.freeform != null && answer.freeform.trim().length > 0)
  );
}

function outputSummary(output: HarnessV1QuestionsToolOutput): string {
  switch (output.action) {
    case 'answered':
      return 'Questions answered.';
    case 'partially-answered':
      return 'Some questions answered.';
    case 'declined':
      return 'Questions skipped.';
    case 'cancelled':
      return 'Questions cancelled.';
  }
}
