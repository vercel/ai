import { Experimental_DecisionUnsupportedQuestionTypeError as DecisionUnsupportedQuestionTypeError } from '@ai-sdk/provider';
import {
  createIdGenerator,
  withUserAgentSuffix,
  type Context,
  type ProviderOptions,
} from '@ai-sdk/provider-utils';
import {
  prepareDecisionQuestions,
  type DecisionQuestion,
} from './decision-question';
import { prepareDecisionState, type DecisionState } from './decision-state';
import { resolveDecisionModel } from '../model/resolve-model';
import { logWarnings } from '../logger/log-warnings';
import type { TelemetryOptions } from '../telemetry/telemetry-options';
import type { Callback } from '../util/callback';
import { notify } from '../util/notify';
import { prepareRetries } from '../util/prepare-retries';
import { VERSION } from '../version';
import type { DecideEndEvent, DecideStartEvent } from './decide-events';
import type { DecisionModel, DecisionResult } from './decision-result';
import { createRestrictedTelemetryDispatcher } from './restricted-telemetry-dispatcher';
import {
  validateDecisionInput,
  validateDecisionAnswers,
} from './validate-decision';

const originalGenerateCallId = createIdGenerator({
  prefix: 'call',
  size: 24,
});

/** Decide answers to typed questions against one shared state. Experimental. */
export async function decide<
  const QUESTIONS extends Record<string, DecisionQuestion>,
  RUNTIME_CONTEXT extends Context = Context,
>({
  model: modelArg,
  state,
  questions,
  maxRetries,
  abortSignal,
  headers,
  providerOptions = {},
  telemetry,
  runtimeContext = {} as RUNTIME_CONTEXT,
  onStart,
  onEnd,
  _internal: { generateCallId = originalGenerateCallId } = {},
}: {
  /** A decision model instance or an ID resolved by the configured default provider. */
  model: DecisionModel;
  state: DecisionState;
  questions: QUESTIONS;
  /** Maximum retries for transient provider failures. Defaults to 2. */
  maxRetries?: number;
  abortSignal?: AbortSignal;
  headers?: Record<string, string>;
  providerOptions?: ProviderOptions;
  /** Optional telemetry configuration. */
  telemetry?: TelemetryOptions<RUNTIME_CONTEXT>;
  /** User-defined runtime context. Treat runtime context as immutable. */
  runtimeContext?: RUNTIME_CONTEXT;
  /** Called when the decide operation begins. */
  onStart?: Callback<DecideStartEvent<RUNTIME_CONTEXT>>;
  /** Called when the decide operation completes. */
  onEnd?: Callback<DecideEndEvent<RUNTIME_CONTEXT>>;
  /** Internal. For test use only. May change without notice. */
  _internal?: {
    generateCallId?: () => string;
  };
}): Promise<DecisionResult<QUESTIONS>> {
  const model = resolveDecisionModel(modelArg);

  validateDecisionInput({ state, questions });

  for (const [questionId, question] of Object.entries(questions)) {
    if (!model.supportedQuestionTypes.includes(question.type)) {
      throw new DecisionUnsupportedQuestionTypeError({
        questionId,
        questionType: question.type,
        provider: model.provider,
        modelId: model.modelId,
      });
    }
  }

  const callId = generateCallId();
  const { maxRetries: resolvedMaxRetries, retry } = prepareRetries({
    maxRetries,
    abortSignal,
  });
  const telemetryDispatcher = createRestrictedTelemetryDispatcher({
    telemetry,
  });
  const runInTracingChannelSpan =
    telemetryDispatcher.runInTracingChannelSpan ??
    (async <T>({ execute }: { execute: () => PromiseLike<T> }) =>
      await execute());
  const startEvent = {
    callId,
    operationId: 'ai.decide' as const,
    runtimeContext,
    provider: model.provider,
    modelId: model.modelId,
    state,
    questions,
    maxRetries: resolvedMaxRetries,
    headers,
    providerOptions,
  };
  return await runInTracingChannelSpan({
    type: 'experimental_decide',
    event: startEvent,
    execute: async () => {
      await notify({
        event: startEvent,
        callbacks: [onStart, telemetryDispatcher.onStart],
      });

      try {
        const preparedState = await prepareDecisionState(state, abortSignal);
        const preparedQuestions = prepareDecisionQuestions(questions);
        const modelCallEvent = {
          callId,
          operationId: 'ai.decide.doDecide' as const,
          provider: model.provider,
          modelId: model.modelId,
          state: preparedState,
          questions: preparedQuestions,
        };
        await notify({
          event: modelCallEvent,
          callbacks: [
            telemetryDispatcher.experimental_onDecisionModelCallStart,
          ],
        });
        const result = await retry(async () => {
          abortSignal?.throwIfAborted();
          return await model.doDecide({
            state: preparedState,
            questions: preparedQuestions,
            abortSignal,
            headers: withUserAgentSuffix(headers ?? {}, `ai/${VERSION}`),
            providerOptions,
          });
        });

        abortSignal?.throwIfAborted();
        validateDecisionAnswers({
          questions,
          answers: result.answers,
          rounding: result.rounding,
        });
        await notify({
          event: { ...modelCallEvent, ...result },
          callbacks: [telemetryDispatcher.experimental_onDecisionModelCallEnd],
        });

        logWarnings({
          warnings: result.warnings,
          provider: model.provider,
          model: model.modelId,
        });

        const inputTokens = result.usage?.inputTokens;
        const outputTokens = result.usage?.outputTokens;
        const decisionResult: DecisionResult<QUESTIONS> = {
          answers: result.answers as DecisionResult<QUESTIONS>['answers'],
          usage: {
            inputTokens,
            outputTokens,
            totalTokens:
              inputTokens != null && outputTokens != null
                ? inputTokens + outputTokens
                : undefined,
          },
          warnings: result.warnings,
          rounding: result.rounding,
          providerMetadata: result.providerMetadata,
          response: {
            ...result.response,
            timestamp: result.response?.timestamp ?? new Date(),
            modelId: result.response?.modelId ?? model.modelId,
          },
        };

        await notify({
          event: { ...startEvent, ...decisionResult },
          callbacks: [onEnd, telemetryDispatcher.onEnd],
        });

        return decisionResult;
      } catch (error) {
        await telemetryDispatcher.onError?.({ callId, error });
        throw error;
      }
    },
  });
}
