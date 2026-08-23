import type {
  LanguageModelV4FilePart,
  LanguageModelV4Prompt,
  LanguageModelV4TextPart,
  LanguageModelV4ToolResultOutput,
  SharedV4Warning,
} from '@ai-sdk/provider';
import {
  convertToBase64,
  getTopLevelMediaType,
  resolveFullMediaType,
  resolveProviderReference,
} from '@ai-sdk/provider-utils';
import type {
  DeepSeekResponsesInputImageContent,
  DeepSeekResponsesInputItem,
  DeepSeekResponsesInputTextContent,
  DeepSeekResponsesOutputTextContent,
  DeepSeekResponsesWebSearchCallAction,
} from './deepseek-responses-api';

/**
 * Converts an AI SDK prompt into DeepSeek Responses API input items.
 *
 * System messages become `instructions`, which DeepSeek inserts as the first
 * system message. Images are only processed by the vision models; the other
 * models replace them with placeholder text.
 *
 * @see https://api-docs.deepseek.com/guides/responses_api
 */
export function convertToDeepSeekResponsesInput({
  prompt,
  providerOptionsName,
  webSearchToolName,
}: {
  prompt: LanguageModelV4Prompt;
  providerOptionsName: string;
  webSearchToolName?: string;
}): {
  input: Array<DeepSeekResponsesInputItem>;
  instructions: string | undefined;
  warnings: Array<SharedV4Warning>;
} {
  const input: Array<DeepSeekResponsesInputItem> = [];
  const warnings: Array<SharedV4Warning> = [];
  const systemMessages: Array<string> = [];

  for (const { role, content } of prompt) {
    switch (role) {
      case 'system': {
        systemMessages.push(content);
        break;
      }

      case 'user': {
        const userContent: Array<
          DeepSeekResponsesInputTextContent | DeepSeekResponsesInputImageContent
        > = [];

        for (const part of content) {
          if (part.type === 'text') {
            userContent.push({ type: 'input_text', text: part.text });
            continue;
          }

          const image = toInputImage(part);

          if (image != null) {
            userContent.push(image);
            continue;
          }

          warnings.push({
            type: 'unsupported',
            feature: `user message part type: ${part.type}`,
          });
        }

        input.push({ type: 'message', role: 'user', content: userContent });
        break;
      }

      case 'assistant': {
        let assistantContent: Array<DeepSeekResponsesOutputTextContent> = [];

        const flushAssistantContent = () => {
          if (assistantContent.length === 0) {
            return;
          }

          input.push({
            type: 'message',
            role: 'assistant',
            content: assistantContent,
          });
          assistantContent = [];
        };

        for (const part of content) {
          switch (part.type) {
            case 'text': {
              assistantContent.push({ type: 'output_text', text: part.text });
              break;
            }

            case 'reasoning': {
              // DeepSeek merges reasoning into the adjacent assistant message,
              // so the reasoning item has to precede the text it belongs to.
              flushAssistantContent();

              const itemId = getItemId(part, providerOptionsName);

              input.push({
                type: 'reasoning',
                ...(itemId != null && { id: itemId }),
                summary: [],
                ...(part.text.length > 0 && {
                  content: [{ type: 'reasoning_text', text: part.text }],
                }),
              });
              break;
            }

            case 'tool-call': {
              flushAssistantContent();

              if (part.toolName === webSearchToolName) {
                // DeepSeek restores the search results server-side from the
                // call id, but rejects the item unless the action it was
                // recorded with comes along. Drop searches we cannot replay.
                const action = getWebSearchAction(part, providerOptionsName);

                if (action != null) {
                  input.push({
                    type: 'web_search_call',
                    id: part.toolCallId,
                    action,
                  });
                }
                break;
              }

              const itemId = getItemId(part, providerOptionsName);

              input.push({
                type: 'function_call',
                ...(itemId != null && { id: itemId }),
                call_id: part.toolCallId,
                name: part.toolName,
                arguments:
                  typeof part.input === 'string'
                    ? part.input
                    : JSON.stringify(part.input),
              });
              break;
            }
          }
        }

        flushAssistantContent();
        break;
      }

      case 'tool': {
        for (const part of content) {
          if (
            part.type !== 'tool-result' ||
            part.toolName === webSearchToolName
          ) {
            continue;
          }

          input.push({
            type: 'function_call_output',
            call_id: part.toolCallId,
            output: stringifyToolOutput(part.output, warnings),
          });
        }
        break;
      }
    }
  }

  return {
    input,
    instructions:
      systemMessages.length > 0 ? systemMessages.join('\n') : undefined,
    warnings,
  };
}

function toInputImage(
  part: LanguageModelV4TextPart | LanguageModelV4FilePart,
): DeepSeekResponsesInputImageContent | undefined {
  if (
    part.type !== 'file' ||
    getTopLevelMediaType(part.mediaType) !== 'image'
  ) {
    return undefined;
  }

  switch (part.data.type) {
    case 'reference':
      return {
        type: 'input_image',
        file_id: resolveProviderReference({
          reference: part.data.reference,
          provider: 'deepseek',
        }),
      };
    case 'url':
      return { type: 'input_image', image_url: part.data.url.toString() };
    case 'data':
      return {
        type: 'input_image',
        image_url: `data:${resolveFullMediaType({ part })};base64,${convertToBase64(part.data.data)}`,
      };
    default:
      return undefined;
  }
}

function stringifyToolOutput(
  output: LanguageModelV4ToolResultOutput,
  warnings: Array<SharedV4Warning>,
): string {
  switch (output.type) {
    case 'text':
    case 'error-text':
      return output.value;
    case 'execution-denied':
      return output.reason ?? 'Tool call execution denied.';
    case 'json':
    case 'error-json':
      return JSON.stringify(output.value);
    case 'content': {
      const text: Array<string> = [];

      for (const item of output.value) {
        if (item.type === 'text') {
          text.push(item.text);
        } else {
          warnings.push({
            type: 'unsupported',
            feature: `tool result content part type: ${item.type}`,
          });
        }
      }

      return text.join('');
    }
  }
}

function getProviderData(
  part: { providerOptions?: Record<string, unknown> },
  providerOptionsName: string,
): Record<string, unknown> | undefined {
  const providerData = part.providerOptions?.[providerOptionsName];

  return providerData != null && typeof providerData === 'object'
    ? (providerData as Record<string, unknown>)
    : undefined;
}

function getItemId(
  part: { providerOptions?: Record<string, unknown> },
  providerOptionsName: string,
): string | undefined {
  const itemId = getProviderData(part, providerOptionsName)?.itemId;

  return typeof itemId === 'string' ? itemId : undefined;
}

function getWebSearchAction(
  part: { providerOptions?: Record<string, unknown> },
  providerOptionsName: string,
): DeepSeekResponsesWebSearchCallAction | undefined {
  const action = getProviderData(part, providerOptionsName)?.action as
    | { type?: unknown; queries?: unknown; url?: unknown }
    | undefined;

  if (action?.type === 'search' && Array.isArray(action.queries)) {
    return { type: 'search', queries: action.queries as Array<string> };
  }

  if (action?.type === 'open_page' && typeof action.url === 'string') {
    return { type: 'open_page', url: action.url };
  }

  return undefined;
}
