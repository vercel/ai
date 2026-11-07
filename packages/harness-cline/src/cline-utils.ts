import { randomUUID } from 'node:crypto';
import type {
  JSONValue,
  LanguageModelV4FinishReason,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import type { HarnessV1Prompt } from '@ai-sdk/harness';
import { extractHarnessPromptContent } from '@ai-sdk/harness/utils';
import { secureJsonParse } from '@ai-sdk/provider-utils';
import type { AgentMessage, AgentRunInput, AgentUsage } from '@cline/agents';

export function extractUserInput(prompt: HarnessV1Prompt): AgentRunInput {
  const content = extractHarnessPromptContent({ prompt });
  if (typeof content === 'string') return content;

  const messageContent: AgentMessage['content'] = content.map(part => {
    if (part.type === 'text') return part;
    return {
      type: 'image',
      image: part.data,
      mediaType: part.mediaType,
    };
  });

  return {
    id: randomUUID(),
    role: 'user',
    content: messageContent,
    createdAt: Date.now(),
  };
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
