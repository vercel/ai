import {
  UnsupportedFunctionalityError,
  type LanguageModelV3Prompt,
  type SharedV3Warning,
} from '@ai-sdk/provider';
import { convertToBase64 } from '@ai-sdk/provider-utils';
import type {
  GoogleGenerativeAIContent,
  GoogleGenerativeAIContentPart,
  GoogleGenerativeAIFunctionResponsePart,
  GoogleGenerativeAIPrompt,
} from './google-generative-ai-prompt';

/**
 * Sentinel value Google documents for replaying functionCall parts whose
 * original thoughtSignature is not available to the client.
 *
 * Gemini 3 models reject `functionCall` parts that lack a `thoughtSignature`
 * with HTTP 400 "Function call is missing a thought_signature in functionCall
 * parts." Sending this sentinel string in place of the missing signature
 * makes Gemini skip the validator and continue the turn.
 *
 * See https://ai.google.dev/gemini-api/docs/thought-signatures.
 */
export const SKIP_THOUGHT_SIGNATURE_VALIDATOR =
  'skip_thought_signature_validator';

type GoogleProviderOptions = {
  thought?: unknown;
  thoughtSignature?: unknown;
  serverToolCallId?: unknown;
  serverToolType?: unknown;
};

function getGoogleProviderOptions(
  providerOptions: Record<string, GoogleProviderOptions> | undefined,
  providerOptionsName: string,
): GoogleProviderOptions | undefined {
  const namespaces = [
    providerOptionsName,
    'google',
    'googleVertex',
    'vertex',
  ].filter((namespace, index, allNamespaces) => {
    return allNamespaces.indexOf(namespace) === index;
  });

  for (const namespace of namespaces) {
    const options = providerOptions?.[namespace];
    if (options != null) {
      return options;
    }
  }
}

const dataUrlRegex = /^data:([^;,]+);base64,(.+)$/s;

function parseBase64DataUrl(
  value: string,
): { mediaType: string; data: string } | undefined {
  const match = dataUrlRegex.exec(value);
  if (match == null) {
    return undefined;
  }

  return {
    mediaType: match[1],
    data: match[2],
  };
}

function convertUrlToolResultPart(
  url: string,
): GoogleGenerativeAIFunctionResponsePart | undefined {
  // Per https://ai.google.dev/api/caching#FunctionResponsePart, only inline data is supported.
  // https://docs.cloud.google.com/vertex-ai/generative-ai/docs/model-reference/function-calling#functionresponsepart suggests that this
  // may be different for Vertex, but this needs to be confirmed and further tested for both APIs.
  const parsedDataUrl = parseBase64DataUrl(url);
  if (parsedDataUrl == null) {
    return undefined;
  }

  return {
    inlineData: {
      mimeType: parsedDataUrl.mediaType,
      data: parsedDataUrl.data,
    },
  };
}

/*
 * Appends tool result content parts to the message using the functionResponse
 * format with support for multimodal parts (e.g. inline images/files alongside
 * text). This format is supported by Gemini 3+ models.
 */
function appendToolResultParts(
  parts: GoogleGenerativeAIContentPart[],
  toolName: string,
  outputValue: Array<{
    type: string;
    [key: string]: unknown;
  }>,
  toolCallId?: string,
): void {
  const functionResponseParts: GoogleGenerativeAIFunctionResponsePart[] = [];
  const responseTextParts: string[] = [];

  for (const contentPart of outputValue) {
    switch (contentPart.type) {
      case 'text': {
        responseTextParts.push(contentPart.text as string);
        break;
      }
      case 'image-data':
      case 'file-data': {
        functionResponseParts.push({
          inlineData: {
            mimeType: contentPart.mediaType as string,
            data: contentPart.data as string,
          },
        });
        break;
      }
      case 'image-url':
      case 'file-url': {
        const functionResponsePart = convertUrlToolResultPart(
          contentPart.url as string,
        );

        if (functionResponsePart != null) {
          functionResponseParts.push(functionResponsePart);
        } else {
          responseTextParts.push(JSON.stringify(contentPart));
        }
        break;
      }
      default: {
        responseTextParts.push(JSON.stringify(contentPart));
        break;
      }
    }
  }

  parts.push({
    functionResponse: {
      ...(toolCallId != null ? { id: toolCallId } : {}),
      name: toolName,
      response: {
        name: toolName,
        content:
          responseTextParts.length > 0
            ? responseTextParts.join('\n')
            : 'Tool executed successfully.',
      },
      ...(functionResponseParts.length > 0
        ? { parts: functionResponseParts }
        : {}),
    },
  });
}

/*
 * Appends tool result content parts using a legacy format for pre-Gemini 3
 * models that do not support multimodal parts within functionResponse. Instead,
 * non-text content like images is sent as separate top-level inlineData parts.
 */
function appendLegacyToolResultParts(
  parts: GoogleGenerativeAIContentPart[],
  toolName: string,
  outputValue: Array<{
    type: string;
    [key: string]: unknown;
  }>,
  toolCallId?: string,
): void {
  for (const contentPart of outputValue) {
    switch (contentPart.type) {
      case 'text':
        parts.push({
          functionResponse: {
            ...(toolCallId != null ? { id: toolCallId } : {}),
            name: toolName,
            response: {
              name: toolName,
              content: contentPart.text,
            },
          },
        });
        break;
      case 'image-data':
        parts.push(
          {
            inlineData: {
              mimeType: String(contentPart.mediaType),
              data: String(contentPart.data),
            },
          },
          {
            text: 'Tool executed successfully and returned this image as a response',
          },
        );
        break;
      default:
        parts.push({ text: JSON.stringify(contentPart) });
        break;
    }
  }
}

export function convertToGoogleGenerativeAIMessages(
  prompt: LanguageModelV3Prompt,
  options?: {
    isGemmaModel?: boolean;
    /**
     * Whether the target model is in the Gemini 3 family. Gemini 3 enforces a
     * `thoughtSignature` on every replayed `functionCall` part; when one is
     * missing we inject the documented `skip_thought_signature_validator`
     * sentinel and emit a warning via `onWarning` so the developer can find
     * and fix the upstream serialization that lost the signature.
     */
    isGemini3Model?: boolean;
    providerOptionsName?: string;
    supportsFunctionResponseParts?: boolean;
    /**
     * Called once for the request when a Gemini 3 `functionCall` part is
     * about to be sent without a `thoughtSignature` and the sentinel is
     * injected.
     */
    onWarning?: (warning: SharedV3Warning) => void;
  },
): GoogleGenerativeAIPrompt {
  const systemInstructionParts: Array<{ text: string }> = [];
  const contents: Array<GoogleGenerativeAIContent> = [];
  let systemMessagesAllowed = true;
  const isGemmaModel = options?.isGemmaModel ?? false;
  const isGemini3Model = options?.isGemini3Model ?? false;
  const providerOptionsName = options?.providerOptionsName ?? 'google';
  const supportsFunctionResponseParts =
    options?.supportsFunctionResponseParts ?? true;
  const onWarning = options?.onWarning;

  let sentinelInjected = false;
  const missingSignatureToolNames: string[] = [];
  const injectSkipSignature = (toolName: string) => {
    missingSignatureToolNames.push(toolName);
    sentinelInjected = true;
    return SKIP_THOUGHT_SIGNATURE_VALIDATOR;
  };

  for (const { role, content } of prompt) {
    switch (role) {
      case 'system': {
        if (!systemMessagesAllowed) {
          throw new UnsupportedFunctionalityError({
            functionality:
              'system messages are only supported at the beginning of the conversation',
          });
        }

        systemInstructionParts.push({ text: content });
        break;
      }

      case 'user': {
        systemMessagesAllowed = false;

        const parts: GoogleGenerativeAIContentPart[] = [];

        for (const part of content) {
          switch (part.type) {
            case 'text': {
              parts.push({ text: part.text });
              break;
            }

            case 'file': {
              // default to image/jpeg for unknown image/* types
              const mediaType =
                part.mediaType === 'image/*' ? 'image/jpeg' : part.mediaType;

              parts.push(
                part.data instanceof URL
                  ? {
                      fileData: {
                        mimeType: mediaType,
                        fileUri: part.data.toString(),
                      },
                    }
                  : {
                      inlineData: {
                        mimeType: mediaType,
                        data: convertToBase64(part.data),
                      },
                    },
              );

              break;
            }
          }
        }

        contents.push({ role: 'user', parts });
        break;
      }

      case 'assistant': {
        systemMessagesAllowed = false;

        contents.push({
          role: 'model',
          parts: content
            .map(part => {
              const providerOpts = getGoogleProviderOptions(
                part.providerOptions,
                providerOptionsName,
              );
              const thoughtSignature =
                providerOpts?.thoughtSignature != null
                  ? String(providerOpts.thoughtSignature)
                  : undefined;

              switch (part.type) {
                case 'text': {
                  return part.text.length === 0
                    ? undefined
                    : {
                        text: part.text,
                        thoughtSignature,
                      };
                }

                case 'reasoning': {
                  return part.text.length === 0
                    ? undefined
                    : {
                        text: part.text,
                        thought: true,
                        thoughtSignature,
                      };
                }

                case 'file': {
                  if (part.data instanceof URL) {
                    throw new UnsupportedFunctionalityError({
                      functionality:
                        'File data URLs in assistant messages are not supported',
                    });
                  }

                  return {
                    inlineData: {
                      mimeType: part.mediaType,
                      data: convertToBase64(part.data),
                    },
                    ...(providerOpts?.thought === true
                      ? { thought: true }
                      : {}),
                    thoughtSignature,
                  };
                }

                case 'tool-call': {
                  const serverToolCallId =
                    providerOpts?.serverToolCallId != null
                      ? String(providerOpts.serverToolCallId)
                      : undefined;
                  const serverToolType =
                    providerOpts?.serverToolType != null
                      ? String(providerOpts.serverToolType)
                      : undefined;

                  // For Gemini 3, every replayed functionCall part must carry a
                  // thoughtSignature or the API returns HTTP 400. If the upstream
                  // serialization layer dropped the signature, inject the
                  // documented sentinel so the request still succeeds.
                  const effectiveThoughtSignature =
                    thoughtSignature ??
                    (isGemini3Model
                      ? injectSkipSignature(part.toolName)
                      : undefined);

                  if (serverToolCallId && serverToolType) {
                    return {
                      toolCall: {
                        toolType: serverToolType,
                        args:
                          typeof part.input === 'string'
                            ? JSON.parse(part.input)
                            : part.input,
                        id: serverToolCallId,
                      },
                      thoughtSignature: effectiveThoughtSignature,
                    };
                  }

                  return {
                    functionCall: {
                      ...(part.toolCallId != null
                        ? { id: part.toolCallId }
                        : {}),
                      name: part.toolName,
                      args: part.input,
                    },
                    thoughtSignature: effectiveThoughtSignature,
                  };
                }

                case 'tool-result': {
                  const serverToolCallId =
                    providerOpts?.serverToolCallId != null
                      ? String(providerOpts.serverToolCallId)
                      : undefined;
                  const serverToolType =
                    providerOpts?.serverToolType != null
                      ? String(providerOpts.serverToolType)
                      : undefined;

                  if (serverToolCallId && serverToolType) {
                    return {
                      toolResponse: {
                        toolType: serverToolType,
                        response:
                          part.output.type === 'json' ? part.output.value : {},
                        id: serverToolCallId,
                      },
                      thoughtSignature,
                    };
                  }

                  return undefined;
                }
              }
            })
            .filter(part => part !== undefined),
        });

        break;
      }

      case 'tool': {
        systemMessagesAllowed = false;

        const parts: GoogleGenerativeAIContentPart[] = [];

        for (const part of content) {
          if (part.type === 'tool-approval-response') {
            continue;
          }

          const partProviderOpts = getGoogleProviderOptions(
            part.providerOptions,
            providerOptionsName,
          );
          const serverToolCallId =
            partProviderOpts?.serverToolCallId != null
              ? String(partProviderOpts.serverToolCallId)
              : undefined;
          const serverToolType =
            partProviderOpts?.serverToolType != null
              ? String(partProviderOpts.serverToolType)
              : undefined;

          if (serverToolCallId && serverToolType) {
            const serverThoughtSignature =
              partProviderOpts?.thoughtSignature != null
                ? String(partProviderOpts.thoughtSignature)
                : undefined;

            if (contents.length > 0) {
              const lastContent = contents[contents.length - 1];
              if (lastContent.role === 'model') {
                lastContent.parts.push({
                  toolResponse: {
                    toolType: serverToolType,
                    response:
                      part.output.type === 'json' ? part.output.value : {},
                    id: serverToolCallId,
                  },
                  thoughtSignature: serverThoughtSignature,
                });
                continue;
              }
            }
          }

          const output = part.output;

          if (output.type === 'content') {
            if (supportsFunctionResponseParts) {
              appendToolResultParts(
                parts,
                part.toolName,
                output.value,
                part.toolCallId,
              );
            } else {
              appendLegacyToolResultParts(
                parts,
                part.toolName,
                output.value,
                part.toolCallId,
              );
            }
          } else {
            parts.push({
              functionResponse: {
                ...(part.toolCallId != null ? { id: part.toolCallId } : {}),
                name: part.toolName,
                response: {
                  name: part.toolName,
                  content:
                    output.type === 'execution-denied'
                      ? (output.reason ?? 'Tool execution denied.')
                      : output.value,
                },
              },
            });
          }
        }

        contents.push({
          role: 'user',
          parts,
        });
        break;
      }
    }
  }

  if (
    isGemmaModel &&
    systemInstructionParts.length > 0 &&
    contents.length > 0 &&
    contents[0].role === 'user'
  ) {
    const systemText = systemInstructionParts
      .map(part => part.text)
      .join('\n\n');

    contents[0].parts.unshift({ text: systemText + '\n\n' });
  }

  if (sentinelInjected && onWarning != null) {
    const uniqueToolNames = Array.from(new Set(missingSignatureToolNames));
    onWarning({
      type: 'other',
      message:
        `Replayed ${missingSignatureToolNames.length} \`functionCall\` part(s) ` +
        `for a Gemini 3 model without a \`thoughtSignature\` ` +
        `(tools: ${uniqueToolNames.map(name => `\`${name}\``).join(', ')}). ` +
        `Injected the documented \`skip_thought_signature_validator\` sentinel ` +
        `to keep the request from failing with HTTP 400. ` +
        `The likely cause is application code that drops ` +
        '`providerOptions.google.thoughtSignature` when persisting or ' +
        'serializing assistant tool-call messages. ' +
        'See https://ai.google.dev/gemini-api/docs/thought-signatures.',
    });
  }

  return {
    systemInstruction:
      systemInstructionParts.length > 0 && !isGemmaModel
        ? { parts: systemInstructionParts }
        : undefined,
    contents,
  };
}
