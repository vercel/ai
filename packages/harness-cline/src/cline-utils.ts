import type {
  JSONValue,
  LanguageModelV4FinishReason,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import {
  HarnessCapabilityUnsupportedError,
  type HarnessV1Prompt,
} from '@ai-sdk/harness';
import { secureJsonParse } from '@ai-sdk/provider-utils';
import type { AgentMessage, AgentUsage } from '@cline/agents';

const HARNESS_ID = 'cline';

/**
 * Extract a single user text string from a `HarnessV1Prompt`. The Cline
 * runtime's `run`/`continue` accept a plain string; multimodal user content
 * is not supported in this foundational version.
 */
export function extractUserText(prompt: HarnessV1Prompt): string {
  if (typeof prompt === 'string') {
    return prompt;
  }

  const { content } = prompt;
  if (typeof content === 'string') {
    return content;
  }

  const parts: string[] = [];
  for (const part of content) {
    if (part.type !== 'text') {
      throw new HarnessCapabilityUnsupportedError({
        message: `cline: only text user-message parts are supported; got '${part.type}'.`,
        harnessId: HARNESS_ID,
      });
    }
    parts.push(part.text);
  }
  return parts.join('\n\n');
}

export function getErrorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Coerce an arbitrary tool output into a JSON-safe value for a `tool-result`
 * stream part. Strings and JSON-serializable objects pass through; anything
 * that can't survive `JSON.stringify` round-tripping (functions, cycles) is
 * stringified. `undefined` becomes `null` — the runtime schema deliberately
 * accepts `null` for tools with no output.
 */
export function toToolResultValue(output: unknown): NonNullable<JSONValue> {
  if (output === undefined || output === null) {
    return null as unknown as NonNullable<JSONValue>;
  }
  if (typeof output === 'string') {
    return output;
  }
  try {
    const serialized = JSON.stringify(output);
    return serialized === undefined
      ? String(output)
      : (secureJsonParse(serialized) as NonNullable<JSONValue>);
  } catch {
    return String(output);
  }
}

/**
 * Map the Cline model-level finish reason (`AgentModelFinishReason`) onto the
 * V4 unified finish-reason vocabulary. Used for `finish-step` parts.
 */
export function mapModelFinishReason(
  reason: string,
): LanguageModelV4FinishReason {
  switch (reason) {
    case 'stop':
      return { unified: 'stop', raw: reason };
    case 'tool-calls':
      return { unified: 'tool-calls', raw: reason };
    case 'max-tokens':
      return { unified: 'length', raw: reason };
    case 'error':
      return { unified: 'error', raw: reason };
    default:
      return { unified: 'other', raw: reason };
  }
}

/**
 * Map a completed run's status onto the V4 unified finish reason. Used for
 * the terminal `finish` part.
 */
export function mapRunFinishReason(
  status: 'completed' | 'aborted' | 'failed',
): LanguageModelV4FinishReason {
  switch (status) {
    case 'completed':
      return { unified: 'stop', raw: status };
    case 'aborted':
      return { unified: 'other', raw: status };
    case 'failed':
      return { unified: 'error', raw: status };
  }
}

/**
 * Convert the Cline runtime's cumulative `AgentUsage` into the V4 usage shape.
 */
export function usageFromAgentUsage(usage: AgentUsage): LanguageModelV4Usage {
  return {
    inputTokens: {
      total: usage.inputTokens,
      noCache: undefined,
      cacheRead: usage.cacheReadTokens,
      cacheWrite: usage.cacheWriteTokens,
    },
    outputTokens: {
      total: usage.outputTokens,
      text: undefined,
      reasoning: usage.reasoningTokenCount,
    },
    ...(usage.totalCost !== undefined
      ? { raw: { totalCost: usage.totalCost } }
      : {}),
  };
}

/**
 * Convert a single assistant message's per-call metrics into the V4 usage
 * shape. Metrics may be absent; all fields stay optional in that case.
 */
export function usageFromMessageMetrics(
  metrics: AgentMessage['metrics'],
): LanguageModelV4Usage {
  return {
    inputTokens: {
      total: metrics?.inputTokens,
      noCache: undefined,
      cacheRead: metrics?.cacheReadTokens,
      cacheWrite: metrics?.cacheWriteTokens,
    },
    outputTokens: {
      total: metrics?.outputTokens,
      text: undefined,
      reasoning: metrics?.reasoningTokenCount,
    },
  };
}
