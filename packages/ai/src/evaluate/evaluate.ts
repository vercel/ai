import {
  Experimental_EvaluationUnsupportedQuestionTypeError as EvaluationUnsupportedQuestionTypeError,
  type Experimental_EvaluationModelV4CallOptions as EvaluationModelV4CallOptions,
} from '@ai-sdk/provider';
import {
  createIdGenerator,
  withUserAgentSuffix,
  type Context,
  type ProviderOptions,
} from '@ai-sdk/provider-utils';
import { resolveEvaluationModel } from '../model/resolve-model';
import { logWarnings } from '../logger/log-warnings';
import { filterIncludedContext } from '../telemetry/filter-included-context';
import type { TelemetryOptions } from '../telemetry/telemetry-options';
import type { Callback } from '../util/callback';
import { notify } from '../util/notify';
import { prepareRetries } from '../util/prepare-retries';
import { VERSION } from '../version';
import type { EvaluateEndEvent, EvaluateStartEvent } from './evaluate-events';
import type {
  EvaluationModel,
  EvaluationQuestion,
  EvaluationResult,
} from './evaluation-result';
import { createRestrictedTelemetryDispatcher } from './restricted-telemetry-dispatcher';
import {
  validateEvaluationInput,
  validateEvaluationAnswers,
} from './validate-evaluation';

const originalGenerateCallId = createIdGenerator({
  prefix: 'call',
  size: 24,
});

/** Evaluate typed questions against one shared state. Experimental. */
export async function evaluate<
  const QUESTIONS extends Record<string, EvaluationQuestion>,
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
  /** An evaluation model instance or an ID resolved by the configured default provider. */
  model: EvaluationModel;
  state: EvaluationModelV4CallOptions['state'];
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
  /** Called when the evaluate operation begins. */
  onStart?: Callback<EvaluateStartEvent<RUNTIME_CONTEXT>>;
  /** Called when the evaluate operation completes. */
  onEnd?: Callback<EvaluateEndEvent<RUNTIME_CONTEXT>>;
  /** Internal. For test use only. May change without notice. */
  _internal?: {
    generateCallId?: () => string;
  };
}): Promise<EvaluationResult<QUESTIONS>> {
  const model = resolveEvaluationModel(modelArg);

  validateEvaluationInput({ state, questions });

  for (const [questionId, question] of Object.entries(questions)) {
    if (!model.supportedQuestionTypes.includes(question.type)) {
      throw new EvaluationUnsupportedQuestionTypeError({
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
    operationId: 'ai.evaluate' as const,
    runtimeContext,
    provider: model.provider,
    modelId: model.modelId,
    state,
    questions,
    maxRetries: resolvedMaxRetries,
    headers,
    providerOptions,
  };
  const tracingStartEvent = {
    ...startEvent,
    runtimeContext: filterIncludedContext({
      context: runtimeContext,
      includeContext: telemetry?.includeRuntimeContext,
    }),
  };

  return await runInTracingChannelSpan({
    type: 'experimental_evaluate',
    event: tracingStartEvent,
    execute: async () => {
      await notify({
        event: startEvent,
        callbacks: [onStart, telemetryDispatcher.onStart],
      });

      try {
        const modelCallEvent = {
          callId,
          operationId: 'ai.evaluate.doEvaluate' as const,
          provider: model.provider,
          modelId: model.modelId,
          state,
          questions,
        };
        await notify({
          event: modelCallEvent,
          callbacks: [
            telemetryDispatcher.experimental_onEvaluationModelCallStart,
          ],
        });
        const result = await retry(async () => {
          abortSignal?.throwIfAborted();
          return await model.doEvaluate({
            state,
            questions,
            abortSignal,
            headers: withUserAgentSuffix(headers ?? {}, `ai/${VERSION}`),
            providerOptions,
          });
        });

        abortSignal?.throwIfAborted();
        validateEvaluationAnswers({
          questions,
          answers: result.answers,
          rounding: result.rounding,
        });
        await notify({
          event: { ...modelCallEvent, ...result },
          callbacks: [
            telemetryDispatcher.experimental_onEvaluationModelCallEnd,
          ],
        });

        logWarnings({
          warnings: result.warnings,
          provider: model.provider,
          model: model.modelId,
        });

        const inputTokens = result.usage?.inputTokens;
        const outputTokens = result.usage?.outputTokens;
        const evaluationResult: EvaluationResult<QUESTIONS> = {
          answers: result.answers as EvaluationResult<QUESTIONS>['answers'],
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
          event: { ...startEvent, ...evaluationResult },
          callbacks: [onEnd, telemetryDispatcher.onEnd],
        });

        return evaluationResult;
      } catch (error) {
        await telemetryDispatcher.onError?.({ callId, error });
        throw error;
      }
    },
  });
}
