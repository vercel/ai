import {
  Experimental_ExtractionRefusalError as ExtractionRefusalError,
  Experimental_ExtractionUnsupportedFieldTypeError as ExtractionUnsupportedFieldTypeError,
  type Experimental_ExtractionModelV4CallOptions as ExtractionCallOptions,
  type Experimental_ExtractionModelV4Field as ExtractionField,
} from '@ai-sdk/provider';
import {
  createIdGenerator,
  withUserAgentSuffix,
  type Context,
  type ProviderOptions,
} from '@ai-sdk/provider-utils';
import {
  prepareDecisionState,
  type DecisionState,
} from '../decide/decision-state';
import { isRecord } from '../decide/validate-decision';
import { logWarnings } from '../logger/log-warnings';
import { resolveExtractionModel } from '../model/resolve-model';
import { prepareLanguageModelCallOptions } from '../prompt/prepare-language-model-call-options';
import type { TelemetryOptions } from '../telemetry/telemetry-options';
import type { Callback } from '../util/callback';
import type { DownloadFunction } from '../util/download/download-function';
import { notify } from '../util/notify';
import { prepareRetries } from '../util/prepare-retries';
import { VERSION } from '../version';
import type { ExtractEndEvent, ExtractStartEvent } from './extract-events';
import type { ExtractionModel, ExtractionResult } from './extraction-result';
import { createRestrictedTelemetryDispatcher } from './restricted-telemetry-dispatcher';
import {
  validateExtractionAnswers,
  validateExtractionInput,
} from './validate-extraction';

const originalGenerateCallId = createIdGenerator({
  prefix: 'call',
  size: 24,
});

/** Extract typed field values from one shared state. Experimental. */
export async function extract<
  const FIELDS extends Record<string, ExtractionField>,
  RUNTIME_CONTEXT extends Context = Context,
>({
  model: modelArg,
  state,
  fields,
  referenceDate,
  maxOutputTokens,
  reasoning,
  maxRetries,
  abortSignal,
  experimental_download: download,
  headers,
  providerOptions = {},
  telemetry,
  runtimeContext = {} as RUNTIME_CONTEXT,
  onStart,
  onEnd,
  _internal: { generateCallId = originalGenerateCallId } = {},
}: {
  /** An extraction model instance or an ID resolved by the configured default provider. */
  model: ExtractionModel;
  state: DecisionState;
  fields: FIELDS;
  /** `YYYY-MM-DD` date that anchors relative dates and dates without a year. */
  referenceDate?: string;
  /** Maximum output tokens for supported models. Must be an integer >= 1. */
  maxOutputTokens?: number;
  /** Reasoning effort for supported models. */
  reasoning?: ExtractionCallOptions['reasoning'];
  /** Maximum retries for transient provider failures. Defaults to 2. */
  maxRetries?: number;
  abortSignal?: AbortSignal;
  /**
   * Download function required for URL-backed file state. Use createDownload({ fetch })
   * with a DNS-protected transport for untrusted URLs. The model's fetch is not used.
   */
  experimental_download?: DownloadFunction;
  headers?: Record<string, string>;
  providerOptions?: ProviderOptions;
  /** Optional telemetry configuration. */
  telemetry?: TelemetryOptions<RUNTIME_CONTEXT>;
  /** User-defined runtime context. Treat runtime context as immutable. */
  runtimeContext?: RUNTIME_CONTEXT;
  /** Called when the extract operation begins. */
  onStart?: Callback<ExtractStartEvent<RUNTIME_CONTEXT>>;
  /** Called when the extract operation completes. */
  onEnd?: Callback<ExtractEndEvent<RUNTIME_CONTEXT>>;
  /** Internal. For test use only. May change without notice. */
  _internal?: {
    generateCallId?: () => string;
  };
}): Promise<ExtractionResult<FIELDS>> {
  const model = resolveExtractionModel(modelArg);

  prepareLanguageModelCallOptions({ maxOutputTokens });
  validateExtractionInput({ state, fields, referenceDate });

  for (const [fieldId, field] of Object.entries(fields)) {
    if (!model.supportedFieldTypes.includes(field.type)) {
      throw new ExtractionUnsupportedFieldTypeError({
        fieldId,
        fieldType: field.type,
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
    operationId: 'ai.extract' as const,
    runtimeContext,
    provider: model.provider,
    modelId: model.modelId,
    state,
    fields,
    referenceDate,
    maxOutputTokens,
    reasoning,
    maxRetries: resolvedMaxRetries,
    headers,
    providerOptions,
  };
  return await runInTracingChannelSpan({
    type: 'experimental_extract',
    event: startEvent,
    execute: async () => {
      await notify({
        event: startEvent,
        callbacks: [onStart, telemetryDispatcher.onStart],
      });

      try {
        const preparedState = await prepareDecisionState({
          state,
          abortSignal,
          download,
        });
        const modelCallEvent = {
          callId,
          operationId: 'ai.extract.doExtract' as const,
          provider: model.provider,
          modelId: model.modelId,
          state: preparedState,
          fields,
          referenceDate,
        };
        await notify({
          event: modelCallEvent,
          callbacks: [
            telemetryDispatcher.experimental_onExtractionModelCallStart,
          ],
        });
        const result = await retry(async () => {
          abortSignal?.throwIfAborted();
          return await model.doExtract({
            state: preparedState,
            fields,
            referenceDate,
            maxOutputTokens,
            reasoning,
            abortSignal,
            headers: withUserAgentSuffix(headers ?? {}, `ai/${VERSION}`),
            providerOptions,
          });
        });

        abortSignal?.throwIfAborted();
        const answers = isRecord(result.answers)
          ? Object.fromEntries(
              Object.entries(result.answers).map(([id, answer]) => {
                if (!isRecord(answer) || answer.type === 'refusal') {
                  return [id, answer];
                }
                if (
                  answer.value === '' ||
                  (Array.isArray(answer.value) && answer.value.length === 0)
                ) {
                  const normalized = { ...answer, value: null };
                  if (normalized.type === 'list') delete normalized.items;
                  return [id, normalized];
                }
                return [id, answer];
              }),
            )
          : result.answers;
        validateExtractionAnswers({
          fields,
          state: preparedState,
          answers,
        });
        const refusedFieldIds = Object.keys(fields).filter(
          id => answers[id]?.type === 'refusal',
        );
        if (refusedFieldIds.length > 0) {
          throw new ExtractionRefusalError({
            fieldIds: refusedFieldIds,
            provider: model.provider,
            modelId: model.modelId,
          });
        }
        await notify({
          event: { ...modelCallEvent, ...result, answers },
          callbacks: [
            telemetryDispatcher.experimental_onExtractionModelCallEnd,
          ],
        });

        logWarnings({
          warnings: result.warnings,
          provider: model.provider,
          model: model.modelId,
        });

        const inputTokens = result.usage?.inputTokens;
        const outputTokens = result.usage?.outputTokens;
        const extractionResult: ExtractionResult<FIELDS> = {
          answers: answers as ExtractionResult<FIELDS>['answers'],
          usage: {
            inputTokens,
            outputTokens,
            totalTokens:
              inputTokens != null && outputTokens != null
                ? inputTokens + outputTokens
                : undefined,
          },
          warnings: result.warnings,
          providerMetadata: result.providerMetadata,
          response: {
            ...result.response,
            timestamp: result.response?.timestamp ?? new Date(),
            modelId: result.response?.modelId ?? model.modelId,
          },
        };

        await notify({
          event: { ...startEvent, ...extractionResult },
          callbacks: [onEnd, telemetryDispatcher.onEnd],
        });

        return extractionResult;
      } catch (error) {
        await telemetryDispatcher.onError?.({ callId, error });
        throw error;
      }
    },
  });
}
