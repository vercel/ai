import {
  convertUint8ArrayToBase64,
  type InferToolSetContext,
  type ModelMessage,
  type ToolResultOutput,
  type ToolSet,
} from '@ai-sdk/provider-utils';
import type { ToolOrder } from '../generate-text/tool-order';
import { prepareTools } from '../prompt/prepare-tools';
import type { Instructions } from '../prompt/prompt';
import type { LanguageModel } from '../types/language-model';
import { hashCanonical } from '../util/canonical-hash';
import { CompactionError } from './compaction-error';
import type { CompactionMeasurement } from './types';

/** @internal Conservative framing shared by main and summary requests. */
export const compactionRequestOverheadTokens = 16;

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
  /** Estimates complete message arrays, including framing. Rounded up. */
  estimateTokens?: (messages: readonly ModelMessage[]) => number;
  /**
   * Input usage reported for the exact request represented by the snapshot.
   * Reused only with an explicit model, when that request remains an unchanged prefix with the same
   * model, instructions, and tools. Newly appended messages are estimated.
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
 * Locally estimate the entire next request without calling a model, executing
 * tools, or fetching media. The default heuristic uses two UTF-8 bytes per
 * text token, message framing, 8,192 tokens per image, and normalized tool
 * schemas. These are conservative estimates, not tokenizer guarantees.
 * Non-image binary media and opaque provider content require an estimator.
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
  estimateTokens = estimateMessageTokens,
  previousRequest,
}: MeasureContextOptions<TOOLS>): Promise<MeasureContextResult> {
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
  // Keep request framing and tools separate from the overridable history
  // estimator. In particular, tools' execute functions are never serialized.
  const fixedInputTokens =
    compactionRequestOverheadTokens +
    (instructionMessages.length === 0
      ? 0
      : validateCount(estimateTokens(instructionMessages))) +
    (preparedTools == null ? 0 : estimateJSON(preparedTools));
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
    hashCanonical(normalizeIdentity({ instructionMessages, preparedTools })),
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
    // An exact provider snapshot can measure an opaque prefix that the local
    // estimator cannot size. Estimate only appended messages, including their
    // framing, rather than requiring the old media to be measured again.
    const additionalTokens = unchanged
      ? 0
      : validateCount(estimateTokens(messages.slice(previous.messages.length)));
    inputTokens = Math.max(
      fixedInputTokens,
      validateCount(previousRequest!.inputTokens) + additionalTokens,
    );
    if (unchanged && inputTokens === previousRequest!.inputTokens) {
      measurement = 'provider';
    }
  } else {
    inputTokens = fixedInputTokens + validateCount(estimateTokens(messages));
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

/** @internal Estimates are always rounded upward. */
export function estimateTextTokens(text: string): number {
  return Math.ceil(new TextEncoder().encode(text).length / 2);
}

/** @internal No media payload is counted as base64 text. */
export function estimateMessageTokens(
  messages: readonly ModelMessage[],
): number {
  let tokens = 0;
  for (const message of messages) {
    tokens += 8 + estimateProviderOptions(message.providerOptions);
    if (typeof message.content === 'string') {
      tokens += estimateTextTokens(message.content);
      continue;
    }
    for (const part of message.content) {
      tokens +=
        4 +
        ('providerOptions' in part
          ? estimateProviderOptions(part.providerOptions)
          : 0);
      switch (part.type) {
        case 'text':
        case 'reasoning':
          tokens += estimateTextTokens(part.text);
          break;
        case 'image':
          tokens += 8192;
          break;
        case 'file':
        case 'reasoning-file':
          tokens += estimateFile(part);
          break;
        case 'custom':
          throw unavailable();
        case 'tool-call':
          tokens += estimateJSON({
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            input: part.input,
          });
          break;
        case 'tool-result':
          tokens +=
            estimateTextTokens(part.toolName + part.toolCallId) +
            estimateToolOutput(part.output);
          break;
        case 'tool-approval-request':
        case 'tool-approval-response':
          tokens += estimateJSON(part);
          break;
        default:
          throw unavailable();
      }
    }
  }
  return tokens;
}

function estimateFile(part: { mediaType?: string; data?: unknown }): number {
  if (part.mediaType?.split('/')[0] === 'image') {
    return 8192;
  }
  if (
    part.data != null &&
    typeof part.data === 'object' &&
    'type' in part.data &&
    part.data.type === 'text' &&
    'text' in part.data &&
    typeof part.data.text === 'string'
  ) {
    return estimateTextTokens(part.data.text);
  }
  throw unavailable();
}

function estimateToolOutput(output: ToolResultOutput): number {
  let tokens =
    'providerOptions' in output
      ? estimateProviderOptions(output.providerOptions)
      : 0;
  if (output.type !== 'content') {
    return (
      tokens +
      estimateJSON(
        output.type === 'execution-denied'
          ? (output.reason ?? '')
          : output.value,
      )
    );
  }
  for (const part of output.value) {
    tokens += 4 + estimateProviderOptions(part.providerOptions);
    switch (part.type) {
      case 'text':
        tokens += estimateTextTokens(part.text);
        break;
      case 'image-data':
      case 'image-url':
      case 'image-file-id':
      case 'image-file-reference':
        tokens += 8192;
        break;
      case 'file':
      case 'file-data':
      case 'file-url':
        tokens += estimateFile(part);
        break;
      default:
        throw unavailable();
    }
  }
  return tokens;
}

function estimateProviderOptions(value: unknown): number {
  if (value == null) return 0;
  const visited = new Set<object>();
  const containsOpaqueContent = (value: unknown): boolean => {
    if (value == null || typeof value !== 'object') return false;
    if (visited.has(value)) throw unavailable();
    visited.add(value);
    const opaque = Object.entries(value).some(
      ([key, child]) =>
        (/encrypted|redacted|compaction/i.test(key) && child != null) ||
        containsOpaqueContent(child),
    );
    visited.delete(value);
    return opaque;
  };
  if (containsOpaqueContent(value)) throw unavailable();
  return estimateJSON(value);
}

function estimateJSON(value: unknown): number {
  try {
    const serialized = JSON.stringify(value);
    if (serialized == null) throw unavailable();
    return estimateTextTokens(serialized);
  } catch (cause) {
    throw unavailable(cause);
  }
}

function validateCount(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new CompactionError({
      code: 'INVALID_OPTIONS',
      message: 'Token counts and estimates must be finite nonnegative numbers.',
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

function unavailable(cause?: unknown): CompactionError {
  return new CompactionError({
    code: 'MEASUREMENT_UNAVAILABLE',
    message:
      'This content cannot be measured locally. Supply estimateTokens or a whole-request measurement.',
    cause,
  });
}
