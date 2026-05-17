import { generateId as defaultGenerateId } from '@ai-sdk/provider-utils';
import type {
  ModelMessage,
  ToolResultOutput,
} from '@ai-sdk/provider-utils';
import { MessageConversionError } from '../prompt/message-conversion-error';
import {
  isToolUIPart,
  type FileUIPart,
  type ReasoningUIPart,
  type TextUIPart,
  type ToolUIPart,
  type UIMessage,
  type UIMessagePart,
} from './ui-messages';

/**
 * Converts an array of `ModelMessage`s — for example the `response.messages`
 * returned by `generateText` / `streamText` or supplied in `onFinish` callbacks
 * — into an array of `UIMessage`s suitable for persistence and rendering via
 * `useChat`.
 *
 * Each `system` / `user` / `assistant` model message becomes one UI message,
 * with `id` generated via the supplied `generateId` (or the SDK's default).
 *
 * `tool` model messages are *not* emitted as a separate UI message. Instead,
 * each `tool-result` part is merged into the matching `tool-*` part on the
 * immediately preceding `assistant` UI message, transitioning its state to
 * `output-available` (or `output-error` / `output-denied` depending on the
 * result type).
 *
 * The inverse of `convertToModelMessages`. Useful when you need to persist
 * the final agent transcript to a database in the same shape `useChat`
 * consumes, without round-tripping through the client.
 *
 * @param messages - The model messages to convert.
 * @param options.generateId - Optional id generator. Defaults to the SDK's `generateId`.
 *
 * @returns An array of UI messages.
 */
export function convertToUIMessages<UI_MESSAGE extends UIMessage = UIMessage>(
  messages: ModelMessage[],
  options?: {
    generateId?: () => string;
  },
): UI_MESSAGE[] {
  const generateMessageId = options?.generateId ?? defaultGenerateId;
  const uiMessages: UI_MESSAGE[] = [];

  for (const message of messages) {
    switch (message.role) {
      case 'system': {
        const text =
          typeof message.content === 'string'
            ? message.content
            : message.content
                .filter(part => part.type === 'text')
                .map(part => part.text)
                .join('');

        const part: TextUIPart = {
          type: 'text',
          text,
        };

        uiMessages.push({
          id: generateMessageId(),
          role: 'system',
          parts: [part],
        } as UI_MESSAGE);
        break;
      }

      case 'user': {
        const parts: UIMessagePart<any, any>[] = [];

        if (typeof message.content === 'string') {
          parts.push({ type: 'text', text: message.content });
        } else {
          for (const part of message.content) {
            switch (part.type) {
              case 'text': {
                parts.push({
                  type: 'text',
                  text: part.text,
                  ...(part.providerOptions != null
                    ? { providerMetadata: part.providerOptions }
                    : {}),
                });
                break;
              }
              case 'image':
              case 'file': {
                const fileUIPart = toFileUIPart(part);
                if (fileUIPart != null) {
                  parts.push(fileUIPart);
                }
                break;
              }
            }
          }
        }

        uiMessages.push({
          id: generateMessageId(),
          role: 'user',
          parts,
        } as UI_MESSAGE);
        break;
      }

      case 'assistant': {
        const parts: UIMessagePart<any, any>[] = [];

        if (typeof message.content === 'string') {
          parts.push({ type: 'text', text: message.content, state: 'done' });
        } else {
          for (const part of message.content) {
            switch (part.type) {
              case 'text': {
                parts.push({
                  type: 'text',
                  text: part.text,
                  state: 'done',
                  ...(part.providerOptions != null
                    ? { providerMetadata: part.providerOptions }
                    : {}),
                });
                break;
              }
              case 'reasoning': {
                const reasoning: ReasoningUIPart = {
                  type: 'reasoning',
                  text: part.text,
                  state: 'done',
                  ...(part.providerOptions != null
                    ? { providerMetadata: part.providerOptions }
                    : {}),
                };
                parts.push(reasoning);
                break;
              }
              case 'file': {
                const fileUIPart = toFileUIPart(part);
                if (fileUIPart != null) {
                  parts.push(fileUIPart);
                }
                break;
              }
              case 'tool-call': {
                const toolPart: ToolUIPart = {
                  type: `tool-${part.toolName}` as ToolUIPart['type'],
                  toolCallId: part.toolCallId,
                  state: 'input-available',
                  input: part.input,
                  ...(part.providerExecuted != null
                    ? { providerExecuted: part.providerExecuted }
                    : {}),
                  ...(part.providerOptions != null
                    ? { callProviderMetadata: part.providerOptions }
                    : {}),
                } as ToolUIPart;
                parts.push(toolPart);
                break;
              }
              case 'tool-result': {
                // Provider-executed tools may emit tool-result inside the
                // assistant message itself. Merge it into the matching
                // tool-call part we just pushed.
                applyToolResult(parts, part);
                break;
              }
              // Other assistant content types (custom, reasoning-file,
              // tool-approval-request) are intentionally skipped here so this
              // utility stays focused on the common persistence path. Callers
              // that need full fidelity should keep their existing UIMessage
              // stream instead.
            }
          }
        }

        uiMessages.push({
          id: generateMessageId(),
          role: 'assistant',
          parts,
        } as UI_MESSAGE);
        break;
      }

      case 'tool': {
        // Merge tool results into the preceding assistant message.
        const previous = uiMessages[uiMessages.length - 1];
        if (previous == null || previous.role !== 'assistant') {
          throw new MessageConversionError({
            originalMessage: message,
            message:
              'tool model message has no preceding assistant message to merge into',
          });
        }

        if (typeof message.content === 'string') {
          // ToolModelMessage.content is always an array per the type, but be defensive.
          break;
        }

        for (const part of message.content) {
          if (part.type === 'tool-result') {
            applyToolResult(previous.parts, part);
          }
          // tool-approval-response parts have no UI representation here; skip.
        }
        break;
      }

      default: {
        const _exhaustiveCheck: never = message;
        throw new MessageConversionError({
          originalMessage: message,
          message: `Unsupported model message role: ${(_exhaustiveCheck as any).role}`,
        });
      }
    }
  }

  return uiMessages;
}

/**
 * Apply a tool-result onto the matching tool-call UI part by toolCallId,
 * transitioning its state and attaching output/errorText as appropriate.
 */
function applyToolResult(
  parts: UIMessagePart<any, any>[],
  toolResult: {
    type: 'tool-result';
    toolCallId: string;
    toolName: string;
    output: ToolResultOutput;
    providerOptions?: Record<string, any>;
  },
): void {
  const target = parts.find(
    (p): p is ToolUIPart =>
      isToolUIPart(p) && p.toolCallId === toolResult.toolCallId,
  );
  if (target == null) {
    return;
  }

  const resultProviderMetadata =
    toolResult.providerOptions != null
      ? { resultProviderMetadata: toolResult.providerOptions }
      : {};

  switch (toolResult.output.type) {
    case 'text': {
      Object.assign(target, {
        state: 'output-available',
        output: toolResult.output.value,
        ...resultProviderMetadata,
      });
      break;
    }
    case 'json':
    case 'content': {
      Object.assign(target, {
        state: 'output-available',
        output: toolResult.output.value,
        ...resultProviderMetadata,
      });
      break;
    }
    case 'error-text': {
      Object.assign(target, {
        state: 'output-error',
        errorText: toolResult.output.value,
        ...resultProviderMetadata,
      });
      break;
    }
    case 'error-json': {
      Object.assign(target, {
        state: 'output-error',
        errorText:
          typeof toolResult.output.value === 'string'
            ? toolResult.output.value
            : JSON.stringify(toolResult.output.value),
        ...resultProviderMetadata,
      });
      break;
    }
    case 'execution-denied': {
      Object.assign(target, {
        state: 'output-denied',
        approval: {
          // The original approval id/reason isn't available here; the
          // execution-denied output only carries the reason.
          id: target.toolCallId,
          isAutomatic: false,
          approved: false,
          reason: toolResult.output.reason,
        },
        ...resultProviderMetadata,
      });
      break;
    }
  }
}

/**
 * Convert a model-message file/image part to a UI FileUIPart. Returns
 * `undefined` for shapes we can't represent in the UI message (e.g.
 * provider-reference data, raw byte buffers without a stable URL).
 */
function toFileUIPart(
  part:
    | {
        type: 'file' | 'image';
        mediaType?: string;
        data?: any;
        image?: any;
        filename?: string;
        providerOptions?: Record<string, any>;
      }
    | any,
): FileUIPart | undefined {
  const providerMetadata =
    part.providerOptions != null
      ? { providerMetadata: part.providerOptions }
      : {};

  // 'image' is the legacy user-content shape; map to file with image/* mediaType.
  if (part.type === 'image') {
    const url =
      part.image instanceof URL
        ? part.image.toString()
        : typeof part.image === 'string'
        ? part.image
        : null;
    if (url == null) {
      return undefined;
    }
    return {
      type: 'file',
      mediaType: part.mediaType ?? 'image/*',
      url,
      ...providerMetadata,
    };
  }

  // type === 'file'
  const data = part.data;
  if (data == null) {
    return undefined;
  }

  if (data.type === 'url') {
    return {
      type: 'file',
      mediaType: part.mediaType ?? 'application/octet-stream',
      url: data.url instanceof URL ? data.url.toString() : String(data.url),
      ...(part.filename ? { filename: part.filename } : {}),
      ...providerMetadata,
    };
  }

  if (data.type === 'reference') {
    return {
      type: 'file',
      mediaType: part.mediaType ?? 'application/octet-stream',
      // FileUIPart requires `url`; surface the reference as a data: URL would
      // be misleading, so we omit by returning undefined for now.
      url: '',
      providerReference: data.reference,
      ...(part.filename ? { filename: part.filename } : {}),
      ...providerMetadata,
    };
  }

  // Inline byte data has no stable URL by itself; we skip rather than embed
  // base64 to avoid quietly blowing up persisted message sizes.
  return undefined;
}
