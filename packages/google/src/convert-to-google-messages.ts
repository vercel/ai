import {
  LanguageModelV4Prompt,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import {
  convertToBase64,
  isProviderReference,
  resolveProviderReference,
} from '@ai-sdk/provider-utils';
import {
  GoogleContent,
  GoogleContentPart,
  GoogleFunctionResponsePart,
  GooglePrompt,
} from './google-prompt';

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
): GoogleFunctionResponsePart | undefined {
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
  parts: GoogleContentPart[],
  toolName: string,
  outputValue: Array<{
    type: string;
    [key: string]: unknown;
  }>,
): void {
  const functionResponseParts: GoogleFunctionResponsePart[] = [];
  const responseTextParts: string[] = [];

  for (const contentPart of outputValue) {
    switch (contentPart.type) {
      case 'text': {
        responseTextParts.push(contentPart.text as string);
        break;
      }
      case 'file-data': {
        functionResponseParts.push({
          inlineData: {
            mimeType: contentPart.mediaType as string,
            data: contentPart.data as string,
          },
        });
        break;
      }
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
  parts: GoogleContentPart[],
  toolName: string,
  outputValue: Array<{
    type: string;
    [key: string]: unknown;
  }>,
): void {
  for (const contentPart of outputValue) {
    switch (contentPart.type) {
      case 'text':
        parts.push({
          functionResponse: {
            name: toolName,
            response: {
              name: toolName,
              content: contentPart.text,
            },
          },
        });
        break;
      case 'file-data':
        if ((contentPart.mediaType as string).startsWith('image/')) {
          parts.push(
            {
              inlineData: {
                mimeType: contentPart.mediaType as string,
                data: contentPart.data as string,
              },
            },
            {
              text: 'Tool executed successfully and returned this image as a response',
            },
          );
        } else {
          parts.push({ text: JSON.stringify(contentPart) });
        }
        break;
      default:
        parts.push({ text: JSON.stringify(contentPart) });
        break;
    }
  }
}

export function convertToGoogleMessages(
  prompt: LanguageModelV4Prompt,
  options?: {
    isGemmaModel?: boolean;
    providerOptionsName?: string;
    supportsFunctionResponseParts?: boolean;
  },
): GooglePrompt {
  const systemInstructionParts: Array<{ text: string }> = [];
  const contents: Array<GoogleContent> = [];
  let systemMessagesAllowed = true;
  const isGemmaModel = options?.isGemmaModel ?? false;
  const providerOptionsName = options?.providerOptionsName ?? 'google';
  const supportsFunctionResponseParts =
    options?.supportsFunctionResponseParts ?? true;

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

        const parts: GoogleContentPart[] = [];

        for (const part of content) {
          switch (part.type) {
            case 'text': {
              parts.push({ text: part.text });
              break;
            }

            case 'file': {
              const mediaType =
                part.mediaType === 'image/*' ? 'image/jpeg' : part.mediaType;

              if (part.data instanceof URL) {
                parts.push({
                  fileData: {
                    mimeType: mediaType,
                    fileUri: part.data.toString(),
                  },
                });
              } else if (isProviderReference(part.data)) {
                if (providerOptionsName === 'vertex') {
                  throw new UnsupportedFunctionalityError({
                    functionality: 'file parts with provider references',
                  });
                }

                parts.push({
                  fileData: {
                    mimeType: mediaType,
                    fileUri: resolveProviderReference({
                      reference: part.data,
                      provider: 'google',
                    }),
                  },
                });
              } else {
                parts.push({
                  inlineData: {
                    mimeType: mediaType,
                    data: convertToBase64(part.data),
                  },
                });
              }

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
              const providerOpts =
                part.providerOptions?.[providerOptionsName] ??
                (providerOptionsName !== 'google'
                  ? part.providerOptions?.google
                  : part.providerOptions?.vertex);
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

                case 'reasoning-file': {
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

                  if (isProviderReference(part.data)) {
                    if (providerOptionsName === 'vertex') {
                      throw new UnsupportedFunctionalityError({
                        functionality: 'file parts with provider references',
                      });
                    }

                    return {
                      fileData: {
                        mimeType: part.mediaType,
                        fileUri: resolveProviderReference({
                          reference: part.data,
                          provider: 'google',
                        }),
                      },
                      ...(providerOpts?.thought === true
                        ? { thought: true }
                        : {}),
                      thoughtSignature,
                    };
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
                      thoughtSignature,
                    };
                  }

                  return {
                    functionCall: {
                      name: part.toolName,
                      args: part.input,
                    },
                    thoughtSignature,
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

        const parts: GoogleContentPart[] = [];

        for (const part of content) {
          if (part.type === 'tool-approval-response') {
            continue;
          }

          const partProviderOpts =
            part.providerOptions?.[providerOptionsName] ??
            (providerOptionsName !== 'google'
              ? part.providerOptions?.google
              : part.providerOptions?.vertex);
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
              appendToolResultParts(parts, part.toolName, output.value);
            } else {
              appendLegacyToolResultParts(parts, part.toolName, output.value);
            }
          } else {
            parts.push({
              functionResponse: {
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

  return {
    systemInstruction:
      systemInstructionParts.length > 0 && !isGemmaModel
        ? { parts: systemInstructionParts }
        : undefined,
    contents,
  };
}
