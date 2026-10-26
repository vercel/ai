import {
  convertUint8ArrayToBase64,
  type InferToolSetContext,
  type ModelMessage,
  type ToolSet,
} from '@ai-sdk/provider-utils';
import type { ToolOrder } from '../generate-text/tool-order';
import { prepareTools } from '../prompt/prepare-tools';
import type { Instructions } from '../prompt/prompt';
import type { LanguageModel } from '../types/language-model';
import { hashCanonical } from '../util/canonical-hash';
import { CompactionError } from './compaction-error';
import type { CompactionMeasurement } from './types';

/** Serializable request identity. It contains hashes, not conversation text. */
export interface ContextMeasurementSnapshot {
  version: 1;
  model: string;
  envelope: string;
  messages: string[];
}

export interface MeasureContextOptions<TOOLS extends ToolSet = ToolSet> {
  model?: LanguageModel;
  messages: readonly ModelMessage[];
  instructions?: Instructions;
  /** @deprecated Use `instructions` instead. */
  system?: Instructions;
  tools?: TOOLS;
  toolOrder?: ToolOrder<TOOLS>;
  toolsContext?: InferToolSetContext<TOOLS>;
  contextWindowTokens?: number;
  /** Instructions, tool schemas, and all fixed request framing, supplied by the caller. */
  fixedInputTokens: number;
  /** Counts message arrays, including their framing and media. Rounded up. */
  countTokens: (messages: readonly ModelMessage[]) => number;
  /**
   * Input usage reported for the exact request represented by the snapshot.
   * Reused only with an explicit model and an unchanged request prefix with the
   * same instructions, tools, and fixed count. Appended messages use countTokens.
   */
  previousRequest?: {
    snapshot: ContextMeasurementSnapshot;
    inputTokens: number;
  };
}

export interface MeasureContextResult extends CompactionMeasurement {
  measurement: 'estimated' | 'provider';
  snapshot: ContextMeasurementSnapshot;
}

/**
 * Combine caller-supplied fixed input and message counts without adding token
 * estimates. Instructions and prepared tools are used only for snapshot identity.
 * No model is called, tool executed, or media fetched.
 */
export async function measureContext<TOOLS extends ToolSet = ToolSet>({
  model,
  messages,
  instructions,
  system,
  tools,
  toolOrder,
  toolsContext,
  contextWindowTokens,
  fixedInputTokens: suppliedFixedInputTokens,
  countTokens,
  previousRequest,
}: MeasureContextOptions<TOOLS>): Promise<MeasureContextResult> {
  const fixedInputTokens = validateCount(suppliedFixedInputTokens);
  if (typeof countTokens !== 'function') {
    throw new CompactionError({
      code: 'INVALID_OPTIONS',
      message: 'countTokens must be a function.',
    });
  }
  if (
    contextWindowTokens != null &&
    (!Number.isFinite(contextWindowTokens) || contextWindowTokens <= 0)
  ) {
    throw new CompactionError({
      code: 'INVALID_OPTIONS',
      message: 'contextWindowTokens must be a finite positive number.',
    });
  }
  if (previousRequest != null) {
    validateCount(previousRequest.inputTokens);
    const snapshot = previousRequest.snapshot;
    if (
      snapshot?.version !== 1 ||
      typeof snapshot.model !== 'string' ||
      typeof snapshot.envelope !== 'string' ||
      !Array.isArray(snapshot.messages) ||
      !snapshot.messages.every(value => typeof value === 'string')
    ) {
      throw new CompactionError({
        code: 'INVALID_OPTIONS',
        message: 'previousRequest must contain a valid measurement snapshot.',
      });
    }
  }

  const resolvedInstructions = instructions ?? system;
  const instructionMessages: ModelMessage[] =
    resolvedInstructions == null
      ? []
      : typeof resolvedInstructions === 'string'
        ? [{ role: 'system', content: resolvedInstructions }]
        : Array.isArray(resolvedInstructions)
          ? resolvedInstructions
          : [resolvedInstructions];
  const preparedTools = await prepareTools({ tools, toolOrder, toolsContext });
  let inputTokens: number;
  let measurement: MeasureContextResult['measurement'] = 'estimated';

  const [modelHash, envelopeHash, messageHashes] = await Promise.all([
    hashCanonical(
      model == null || typeof model === 'string'
        ? (model ?? null)
        : {
            provider: model.provider,
            modelId: model.modelId,
            specificationVersion: model.specificationVersion,
          },
    ),
    hashCanonical(
      normalizeIdentity({
        instructionMessages,
        preparedTools,
        fixedInputTokens,
      }),
    ),
    Promise.all(
      messages.map(message =>
        hashCanonical(
          normalizeIdentity({
            role: message.role,
            content: message.content,
            providerOptions: message.providerOptions,
          }),
        ),
      ),
    ),
  ]);
  const snapshot: ContextMeasurementSnapshot = {
    version: 1,
    model: modelHash,
    envelope: envelopeHash,
    messages: messageHashes,
  };
  const previous = previousRequest?.snapshot;
  if (
    model != null &&
    previous != null &&
    previous.model === snapshot.model &&
    previous.envelope === snapshot.envelope &&
    previous.messages.length <= messageHashes.length &&
    previous.messages.every((hash, index) => hash === messageHashes[index])
  ) {
    const unchanged = previous.messages.length === messages.length;
    // A matching provider count already includes the prefix and fixed input.
    // Count only appended messages; opaque prefixes need not be counted again.
    const additionalTokens = unchanged
      ? 0
      : validateCount(countTokens(messages.slice(previous.messages.length)));
    inputTokens = Math.max(
      fixedInputTokens,
      validateCount(previousRequest!.inputTokens) + additionalTokens,
    );
    if (unchanged && inputTokens === previousRequest!.inputTokens) {
      measurement = 'provider';
    }
  } else {
    inputTokens = fixedInputTokens + validateCount(countTokens(messages));
  }

  return {
    model,
    contextWindowTokens,
    inputTokens: validateCount(inputTokens),
    fixedInputTokens: validateCount(fixedInputTokens),
    measurement,
    snapshot,
  };
}

function validateCount(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new CompactionError({
      code: 'INVALID_OPTIONS',
      message: 'Token counts must be finite nonnegative numbers.',
    });
  }
  return Math.ceil(value);
}

/** Normalize URL and binary data before hashing: canonicalJSON handles JSON. */
function normalizeIdentity(
  value: unknown,
  ancestors = new Set<object>(),
): unknown {
  if (value == null || typeof value !== 'object') {
    if (typeof value === 'function' || typeof value === 'symbol') {
      throw unavailable();
    }
    return value;
  }
  if (value instanceof URL) return { url: value.href };
  if (value instanceof ArrayBuffer) {
    return { bytes: convertUint8ArrayToBase64(new Uint8Array(value)) };
  }
  if (ArrayBuffer.isView(value)) {
    return {
      bytes: convertUint8ArrayToBase64(
        new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
      ),
    };
  }
  if (ancestors.has(value)) throw unavailable();
  ancestors.add(value);
  const normalized = Array.isArray(value)
    ? value.map(item => normalizeIdentity(item, ancestors))
    : Object.fromEntries(
        Object.entries(value)
          .filter(([, child]) => child !== undefined)
          .map(([key, child]) => [key, normalizeIdentity(child, ancestors)]),
      );
  ancestors.delete(value);
  return normalized;
}

function unavailable(): CompactionError {
  return new CompactionError({
    code: 'MEASUREMENT_UNAVAILABLE',
    message:
      'This request cannot be represented by a measurement snapshot. Supply context directly to compactMessages.',
  });
}
