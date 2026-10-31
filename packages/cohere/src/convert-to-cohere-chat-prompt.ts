import {
  UnsupportedFunctionalityError,
  type LanguageModelV4FilePart,
  type LanguageModelV4Prompt,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  convertBase64ToUint8Array,
  convertToBase64,
  getTopLevelMediaType,
  parseProviderOptions,
  resolveFullMediaType,
} from '@ai-sdk/provider-utils';
import { cohereImagePartProviderOptions } from './cohere-chat-language-model-options';
import type {
  CohereAssistantMessage,
  CohereChatPrompt,
  CohereUserMessageContent,
} from './cohere-chat-prompt';

function sanitizeForSerialization(
  val: unknown,
  ancestors: Set<unknown>,
): unknown {
  if (typeof val === 'bigint') {
    return val.toString();
  }
  if (typeof val !== 'object' || val === null) {
    return val;
  }
  if (typeof (val as { toJSON?: unknown }).toJSON === 'function') {
    return val;
  }
  if (ancestors.has(val)) {
    return '[Circular]';
  }
  ancestors.add(val);
  try {
    if (Array.isArray(val)) {
      return val.map(item => sanitizeForSerialization(item, ancestors));
    }
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(val)) {
      result[key] = sanitizeForSerialization(item, ancestors);
    }
    return result;
  } finally {
    ancestors.delete(val);
  }
}

function serializeCohereToolCallArguments(input: unknown): string {
  if (typeof input === 'string') {
    return input;
  }

  if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
    try {
      return JSON.stringify(sanitizeForSerialization(input, new Set()));
    } catch {
      return '{}';
    }
  }

  return '{}';
}

function safeStringifyCohereToolOutput(value: unknown): string {
  try {
    return JSON.stringify(sanitizeForSerialization(value, new Set()));
  } catch {
    return String(value);
  }
}

export async function convertToCohereChatPrompt(
  prompt: LanguageModelV4Prompt,
): Promise<{
  messages: CohereChatPrompt;
  documents: Array<{
    data: { text: string; title?: string };
  }>;
  warnings: SharedV4Warning[];
}> {
  const messages: CohereChatPrompt = [];
  const documents: Array<{ data: { text: string; title?: string } }> = [];
  const warnings: SharedV4Warning[] = [];

  for (const { role, content } of prompt) {
    switch (role) {
      case 'system': {
        messages.push({ role: 'system', content });
        break;
      }

      case 'user': {
        const userContentParts: Array<CohereUserMessageContent> = [];
        let hasImage = false;

        for (const part of content) {
          switch (part.type) {
            case 'text': {
              if (part.text.length > 0) {
                userContentParts.push({ type: 'text', text: part.text });
              }
              break;
            }
            case 'file': {
              if (getTopLevelMediaType(part.mediaType) === 'image') {
                hasImage = true;
                const url = buildImageUrl({ part });
                const cohereOptions =
                  (await parseProviderOptions({
                    provider: 'cohere',
                    providerOptions: part.providerOptions,
                    schema: cohereImagePartProviderOptions,
                  })) ?? {};

                userContentParts.push({
                  type: 'image_url',
                  image_url: {
                    url,
                    ...(cohereOptions.detail
                      ? { detail: cohereOptions.detail }
                      : {}),
                  },
                });
                break;
              }

              let textContent: string;
              switch (part.data.type) {
                case 'reference': {
                  throw new UnsupportedFunctionalityError({
                    functionality: 'file parts with provider references',
                  });
                }
                case 'url': {
                  throw new UnsupportedFunctionalityError({
                    functionality: 'File URL data',
                    message:
                      'URLs should be downloaded by the AI SDK and not reach this point. This indicates a configuration issue.',
                  });
                }
                case 'text': {
                  textContent = part.data.text;
                  break;
                }
                case 'data': {
                  textContent = new TextDecoder().decode(
                    typeof part.data.data === 'string'
                      ? convertBase64ToUint8Array(part.data.data)
                      : part.data.data,
                  );
                  break;
                }
              }

              documents.push({
                data: {
                  text: textContent,
                  title: part.filename,
                },
              });
              break;
            }
          }
        }

        if (hasImage) {
          messages.push({ role: 'user', content: userContentParts });
        } else {
          messages.push({
            role: 'user',
            content: userContentParts
              .map(p => (p.type === 'text' ? p.text : ''))
              .join(''),
          });
        }
        break;
      }

      case 'assistant': {
        let text = '';
        const toolCalls: CohereAssistantMessage['tool_calls'] = [];

        for (const part of content) {
          switch (part.type) {
            case 'text': {
              text += part.text;
              break;
            }
            case 'tool-call': {
              toolCalls.push({
                id: part.toolCallId,
                type: 'function' as const,
                function: {
                  name: part.toolName,
                  arguments: serializeCohereToolCallArguments(part.input),
                },
              });
              break;
            }
          }
        }

        messages.push({
          role: 'assistant',
          content: toolCalls.length > 0 ? undefined : text,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
          tool_plan: undefined,
        });

        break;
      }
      case 'tool': {
        messages.push(
          ...content
            .filter(toolResult => toolResult.type !== 'tool-approval-response')
            .map(toolResult => {
              const output = toolResult.output;

              let contentValue: string;
              switch (output.type) {
                case 'text':
                case 'error-text':
                  contentValue = output.value;
                  break;
                case 'execution-denied':
                  contentValue = output.reason ?? 'Tool call execution denied.';
                  break;
                case 'content':
                case 'json':
                case 'error-json':
                  contentValue = safeStringifyCohereToolOutput(output.value);
                  break;
              }

              return {
                role: 'tool' as const,
                content: contentValue,
                tool_call_id: toolResult.toolCallId,
              };
            }),
        );

        break;
      }
      default: {
        const _exhaustiveCheck: never = role;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }

  return { messages, documents, warnings };
}

function buildImageUrl({ part }: { part: LanguageModelV4FilePart }): string {
  switch (part.data.type) {
    case 'url': {
      return part.data.url.toString();
    }
    case 'data': {
      return `data:${resolveFullMediaType({ part })};base64,${convertToBase64(part.data.data)}`;
    }
    case 'reference': {
      throw new UnsupportedFunctionalityError({
        functionality: 'image file parts with provider references',
      });
    }
    case 'text': {
      throw new UnsupportedFunctionalityError({
        functionality: 'image file parts with text data',
      });
    }
  }
}
