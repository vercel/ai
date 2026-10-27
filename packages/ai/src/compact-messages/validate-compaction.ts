import {
  convertUint8ArrayToBase64,
  safeValidateTypes,
  type ModelMessage,
} from '@ai-sdk/provider-utils';
import { modelMessageSchema } from '../prompt/message';
import { z } from '../util/zod';
import { CompactionError } from './compaction-error';
import type { CompactionCheckpoint } from './types';

/** Stable message semantics, without application-only metadata. */
export function serializeMessages(messages: readonly ModelMessage[]): string {
  try {
    return JSON.stringify(
      messages.map(({ role, content, providerOptions }) => ({
        role,
        content,
        providerOptions,
      })),
      function (key, value) {
        // Inspect the original value: Buffer.toJSON() runs before the replacer.
        const original = this[key];
        if (original instanceof ArrayBuffer || ArrayBuffer.isView(original)) {
          const bytes =
            original instanceof ArrayBuffer
              ? new Uint8Array(original)
              : new Uint8Array(
                  original.buffer,
                  original.byteOffset,
                  original.byteLength,
                );
          return { type: 'binary', data: convertUint8ArrayToBase64(bytes) };
        }
        if (
          value != null &&
          typeof value === 'object' &&
          !Array.isArray(value)
        ) {
          return Object.fromEntries(
            Object.keys(value)
              .sort()
              .map(key => [key, value[key]]),
          );
        }
        return value;
      },
    );
  } catch (cause) {
    throw new CompactionError({
      code: 'INVALID_MESSAGES',
      message: 'Message content must be serializable.',
      cause,
    });
  }
}

export async function createCheckpoint(
  messages: readonly ModelMessage[],
  startIndex: number,
  messageCount: number,
): Promise<CompactionCheckpoint> {
  const bytes = new TextEncoder().encode(
    serializeMessages(messages.slice(startIndex, startIndex + messageCount)),
  );
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return {
    version: 1,
    startIndex,
    messageCount,
    digest: Array.from(new Uint8Array(digest), byte =>
      byte.toString(16).padStart(2, '0'),
    ).join(''),
  };
}

export async function validateCheckpoint(
  messages: readonly ModelMessage[],
  checkpoint: CompactionCheckpoint | undefined,
): Promise<void> {
  if (checkpoint === undefined) return;
  if (
    checkpoint === null ||
    checkpoint.version !== 1 ||
    !Number.isSafeInteger(checkpoint.startIndex) ||
    checkpoint.startIndex < 0 ||
    !Number.isSafeInteger(checkpoint.messageCount) ||
    checkpoint.messageCount < 1 ||
    checkpoint.startIndex + checkpoint.messageCount > messages.length ||
    typeof checkpoint.digest !== 'string' ||
    (
      await createCheckpoint(
        messages,
        checkpoint.startIndex,
        checkpoint.messageCount,
      )
    ).digest !== checkpoint.digest
  ) {
    throw new CompactionError({
      code: 'INVALID_CHECKPOINT',
      message:
        'The checkpoint version, range or message digest does not match.',
    });
  }
}

/** Validate without normalizing away provider options or application fields. */
export async function isValidMessages(
  messages: readonly ModelMessage[],
  allowedPendingToolCalls?: ReadonlyMap<string, string>,
): Promise<boolean> {
  const validation = await safeValidateTypes({
    value: messages,
    schema: z.array(modelMessageSchema),
  });
  if (!validation.success) return false;

  return hasValidToolExchanges(messages, allowedPendingToolCalls);
}

/** Check boundaries of already validated messages without revalidating their payloads. */
export function hasValidToolExchanges(
  messages: readonly ModelMessage[],
  allowedPendingToolCalls?: ReadonlyMap<string, string>,
): boolean {
  const calls = new Map<
    string,
    { toolName: string; providerExecuted: boolean }
  >();
  const results = new Set<string>();
  const approvals = new Map<string, string>();
  const approvalResponses = new Set<string>();
  const pending = new Map<string, string>();

  for (const message of messages) {
    if (message.role === 'user' || message.role === 'system') {
      if (pending.size > 0) return false;
    }
    if (typeof message.content === 'string') continue;
    for (const part of message.content) {
      switch (part.type) {
        case 'tool-call':
          // IDs may be reused in later completed exchanges. Only a second
          // unresolved ordinary call with the same ID is ambiguous.
          if (pending.has(part.toolCallId)) return false;
          results.delete(part.toolCallId);
          calls.set(part.toolCallId, {
            toolName: part.toolName,
            providerExecuted: part.providerExecuted === true,
          });
          if (!part.providerExecuted) {
            pending.set(
              part.toolCallId,
              serializeMessages([{ role: 'assistant', content: [part] }]),
            );
          }
          break;
        case 'tool-result': {
          const call = calls.get(part.toolCallId);
          if (
            (call == null && message.role !== 'assistant') ||
            (call != null && call.toolName !== part.toolName) ||
            (call != null &&
              !call.providerExecuted &&
              message.role === 'assistant') ||
            results.has(part.toolCallId)
          )
            return false;
          // Assistant-role results are provider-managed; the provider need not
          // expose a corresponding local tool-call message.
          results.add(part.toolCallId);
          pending.delete(part.toolCallId);
          break;
        }
        case 'tool-approval-request':
          if (
            !calls.has(part.toolCallId) ||
            (approvals.has(part.approvalId) &&
              !approvalResponses.has(part.approvalId))
          )
            return false;
          approvalResponses.delete(part.approvalId);
          approvals.set(part.approvalId, part.toolCallId);
          break;
        case 'tool-approval-response':
          if (
            (!approvals.has(part.approvalId) && !part.providerExecuted) ||
            approvalResponses.has(part.approvalId)
          )
            return false;
          approvalResponses.add(part.approvalId);
          break;
      }
    }
  }

  // A history may end at a pending tool/approval boundary. Never move an
  // unresolved call across a later user message or detach a response from it.
  return (
    allowedPendingToolCalls === undefined ||
    [...pending].every(([id, call]) => allowedPendingToolCalls.get(id) === call)
  );
}

/** Pending calls may survive compaction, but completed calls cannot become pending. */
export function getPendingToolCalls(
  messages: readonly ModelMessage[],
): Map<string, string> {
  const pending = new Map<string, string>();
  for (const message of messages) {
    if (typeof message.content === 'string') continue;
    for (const part of message.content) {
      if (part.type === 'tool-call' && !part.providerExecuted) {
        pending.set(
          part.toolCallId,
          serializeMessages([{ role: 'assistant', content: [part] }]),
        );
      } else if (part.type === 'tool-result') {
        pending.delete(part.toolCallId);
      }
    }
  }
  return pending;
}
