import {
  Experimental_ExtractionRefusalError as ExtractionRefusalError,
  Experimental_ExtractionUnsupportedFieldTypeError as ExtractionUnsupportedFieldTypeError,
  type Experimental_ExtractionModelV4CallOptions as ExtractionCallOptions,
  type Experimental_ExtractionModelV4Field as ExtractionField,
} from '@ai-sdk/provider';
import {
  withUserAgentSuffix,
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
import type { DownloadFunction } from '../util/download/download-function';
import { prepareRetries } from '../util/prepare-retries';
import { VERSION } from '../version';
import type { ExtractionModel, ExtractionResult } from './extraction-result';
import {
  validateExtractionAnswers,
  validateExtractionInput,
} from './validate-extraction';

/** Extract typed field values from one shared state. Experimental. */
export async function extract<
  const FIELDS extends Record<string, ExtractionField>,
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
}: {
  /** An extraction model instance. */
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

  const { retry } = prepareRetries({ maxRetries, abortSignal });
  const preparedState = await prepareDecisionState({
    state,
    abortSignal,
    download,
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

  logWarnings({
    warnings: result.warnings,
    provider: model.provider,
    model: model.modelId,
  });

  const inputTokens = result.usage?.inputTokens;
  const outputTokens = result.usage?.outputTokens;
  return {
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
}
