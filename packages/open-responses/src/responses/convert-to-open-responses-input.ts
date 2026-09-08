import type { LanguageModelV3Prompt, SharedV3Warning } from '@ai-sdk/provider';
import { convertToBase64 } from '@ai-sdk/provider-utils';
import type {
  FunctionCallItemParam,
  FunctionCallOutputItemParam,
  InputFileContentParam,
  InputImageContentParam,
  InputTextContentParam,
  OpenResponsesRequestBody,
  OutputTextContentParam,
  RefusalContentParam,
} from './open-responses-api';

export async function convertToOpenResponsesInput({
  prompt,
  providerOptionsName = 'open-responses',
  strictResponseInput = false,
}: {
  prompt: LanguageModelV3Prompt;
  providerOptionsName?: string;
  strictResponseInput?: boolean;
}): Promise<{
  input: OpenResponsesRequestBody['input'];
  instructions: string | undefined;
  warnings: Array<SharedV3Warning>;
}> {
  const input: OpenResponsesRequestBody['input'] = [];
  const warnings: Array<SharedV3Warning> = [];
  const systemMessages: string[] = [];

  for (const { role, content } of prompt) {
    switch (role) {
      case 'system': {
        systemMessages.push(content);
        break;
      }

      case 'user': {
        const userContent: Array<
          InputTextContentParam | InputImageContentParam | InputFileContentParam
        > = [];

        for (const part of content) {
          switch (part.type) {
            case 'text': {
              userContent.push({ type: 'input_text', text: part.text });
              break;
            }
            case 'file': {
              const mediaType =
                part.mediaType === 'image/*' ? 'image/jpeg' : part.mediaType;

<<<<<<< HEAD
              if (part.mediaType.startsWith('image/')) {
                userContent.push({
                  type: 'input_image',
                  ...(part.data instanceof URL
                    ? { image_url: part.data.toString() }
                    : {
                        image_url: `data:${mediaType};base64,${convertToBase64(part.data)}`,
                      }),
                });
              } else if (part.data instanceof URL) {
                userContent.push({
                  type: 'input_file',
                  file_url: part.data.toString(),
                });
              } else {
                userContent.push({
                  type: 'input_file',
                  filename: part.filename ?? 'data',
                  file_data: `data:${mediaType};base64,${convertToBase64(part.data)}`,
                });
=======
                  if (topLevel === 'image') {
                    userContent.push({
                      type: 'input_image',
                      ...(part.data.type === 'url'
                        ? { image_url: part.data.url.toString() }
                        : {
                            image_url: `data:${resolveFullMediaType({ part })};base64,${convertToBase64(part.data.data)}`,
                          }),
                      detail: getImageDetail(part, providerOptionsName),
                    });
                  } else if (part.data.type === 'url') {
                    userContent.push({
                      type: 'input_file',
                      file_url: part.data.url.toString(),
                    });
                  } else {
                    const fullMediaType = resolveFullMediaType({ part });
                    userContent.push({
                      type: 'input_file',
                      filename: part.filename ?? 'data',
                      file_data: `data:${fullMediaType};base64,${convertToBase64(part.data.data)}`,
                    });
                  }

                  break;
                }
>>>>>>> d127e7a2b6 (fix: preserve image detail settings and defaults for Open Responses image inputs (#20503))
              }
              break;
            }
          }
        }

        input.push({ type: 'message', role: 'user', content: userContent });
        break;
      }

      case 'assistant': {
        let assistantContent: Array<
          OutputTextContentParam | RefusalContentParam
        > = [];
        const toolCalls: Array<FunctionCallItemParam> = [];
        let assistantMessageId: string | undefined;

        const flushAssistantContent = () => {
          if (assistantContent.length === 0) {
            return;
          }

          if (strictResponseInput && assistantMessageId == null) {
            input.push({
              type: 'message',
              role: 'assistant',
              content: assistantContent
                .map(part =>
                  part.type === 'output_text' ? part.text : part.refusal,
                )
                .join(''),
            });
          } else if (strictResponseInput) {
            input.push({
              id: assistantMessageId,
              type: 'message',
              status: 'completed',
              role: 'assistant',
              content: assistantContent.map(part =>
                part.type === 'output_text'
                  ? {
                      ...part,
                      annotations: part.annotations ?? [],
                      logprobs: part.logprobs ?? [],
                    }
                  : part,
              ),
            });
          } else {
            input.push({
              type: 'message',
              role: 'assistant',
              content: assistantContent,
              ...(assistantMessageId != null && { id: assistantMessageId }),
            });
          }
          assistantContent = [];
          assistantMessageId = undefined;
        };

        for (const part of content) {
          switch (part.type) {
            case 'text': {
              const providerData = part.providerOptions?.[providerOptionsName];
              const itemId =
                typeof providerData?.itemId === 'string'
                  ? providerData.itemId
                  : undefined;

              if (
                assistantContent.length > 0 &&
                assistantMessageId !== itemId
              ) {
                flushAssistantContent();
              }

              assistantMessageId = itemId;
              assistantContent.push({ type: 'output_text', text: part.text });
              break;
            }
            case 'tool-call': {
              const argumentsValue =
                typeof part.input === 'string'
                  ? part.input
                  : JSON.stringify(part.input);
              toolCalls.push({
                type: 'function_call',
                call_id: part.toolCallId,
                name: part.toolName,
                arguments: argumentsValue,
              });
              break;
            }
          }
        }

        flushAssistantContent();

        // Push function calls as separate items
        for (const toolCall of toolCalls) {
          input.push(toolCall);
        }

        break;
      }

      case 'tool': {
        for (const part of content) {
          if (part.type === 'tool-result') {
            const output = part.output;
            let contentValue: FunctionCallOutputItemParam['output'];

            switch (output.type) {
              case 'text':
              case 'error-text':
                contentValue = output.value;
                break;
              case 'execution-denied':
                contentValue = output.reason ?? 'Tool call execution denied.';
                break;
              case 'json':
              case 'error-json':
                contentValue = JSON.stringify(output.value);
                break;
              case 'content': {
                const contentParts: Array<
                  | InputTextContentParam
                  | InputImageContentParam
                  | InputFileContentParam
                > = [];
                for (const item of output.value) {
                  switch (item.type) {
                    case 'text': {
                      contentParts.push({
                        type: 'input_text',
                        text: item.text,
                      });
                      break;
                    }
<<<<<<< HEAD
                    case 'image-data': {
                      contentParts.push({
                        type: 'input_image',
                        image_url: `data:${item.mediaType};base64,${item.data}`,
                      });
                      break;
                    }
                    case 'image-url': {
                      contentParts.push({
                        type: 'input_image',
                        image_url: item.url,
                      });
                      break;
                    }
                    case 'file-data': {
                      contentParts.push({
                        type: 'input_file',
                        filename: item.filename ?? 'data',
                        file_data: `data:${item.mediaType};base64,${item.data}`,
                      });
=======
                    case 'file': {
                      const topLevel = getTopLevelMediaType(item.mediaType);

                      if (item.data.type === 'data') {
                        const fullMediaType = resolveFullMediaType({
                          part: item,
                        });
                        if (topLevel === 'image') {
                          contentParts.push({
                            type: 'input_image',
                            image_url: `data:${fullMediaType};base64,${convertToBase64(item.data.data)}`,
                            detail: getImageDetail(item, providerOptionsName),
                          });
                        } else {
                          contentParts.push({
                            type: 'input_file',
                            filename: item.filename ?? 'data',
                            file_data: `data:${fullMediaType};base64,${convertToBase64(item.data.data)}`,
                          });
                        }
                      } else if (item.data.type === 'url') {
                        if (topLevel === 'image') {
                          contentParts.push({
                            type: 'input_image',
                            image_url: item.data.url.toString(),
                            detail: getImageDetail(item, providerOptionsName),
                          });
                        } else {
                          contentParts.push({
                            type: 'input_file',
                            file_url: item.data.url.toString(),
                          });
                        }
                      } else {
                        warnings.push({
                          type: 'other',
                          message: `unsupported tool content part type: ${item.type} with data type: ${item.data.type}`,
                        });
                      }
>>>>>>> d127e7a2b6 (fix: preserve image detail settings and defaults for Open Responses image inputs (#20503))
                      break;
                    }
                    default: {
                      warnings.push({
                        type: 'other',
                        message: `unsupported tool content part type: ${(item as { type: string }).type}`,
                      });
                      break;
                    }
                  }
                }
                contentValue = contentParts;
                break;
              }
            }

            input.push({
              type: 'function_call_output',
              call_id: part.toolCallId,
              output: contentValue,
            });
          }
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
<<<<<<< HEAD
=======

async function encodeExtensionInputPart({
  extensionRegistry,
  part,
  providerTool,
}: {
  extensionRegistry: OpenResponsesExtensionRegistry | undefined;
  part: OpenResponsesExtensionInputPart;
  providerTool: LanguageModelV4ProviderTool;
}): Promise<OpenResponsesExtensionItem[] | undefined> {
  const extension = extensionRegistry?.byProviderToolId.get(providerTool.id);
  const encodeInputItem = extension?.encodeInputItem;
  const itemTypes = extension?.itemTypes;
  if (encodeInputItem == null || itemTypes == null) {
    return undefined;
  }

  try {
    const value = await encodeInputItem({
      part,
      tool: providerTool,
    });
    const items =
      value == null ? undefined : Array.isArray(value) ? value : [value];

    if (
      items == null ||
      items.length === 0 ||
      !items.every(
        item =>
          isOpenResponsesExtensionItem(item) && itemTypes.includes(item.type),
      )
    ) {
      return undefined;
    }

    return items;
  } catch {
    return undefined;
  }
}

function getExtensionReplay({
  part,
  providerOptionsName,
  extensionRegistry,
}: {
  part: {
    providerOptions?: Record<string, unknown>;
  };
  providerOptionsName: string;
  extensionRegistry: OpenResponsesExtensionRegistry | undefined;
}): { item?: OpenResponsesExtensionItem } | undefined {
  const extensionData = getProviderData(
    part,
    providerOptionsName,
  )?.openResponsesExtension;

  if (
    extensionData == null ||
    typeof extensionData !== 'object' ||
    Array.isArray(extensionData)
  ) {
    return undefined;
  }

  const { id, item, itemId } = extensionData as {
    id?: unknown;
    item?: unknown;
    itemId?: unknown;
  };

  if (typeof id !== 'string') {
    return undefined;
  }

  const extension = extensionRegistry?.byExtensionId.get(
    id as LanguageModelV4ProviderTool['id'],
  );

  if (extension == null) {
    return undefined;
  }

  if (
    isOpenResponsesExtensionItem(item) &&
    extension.itemTypes?.includes(item.type)
  ) {
    return { item };
  }

  return typeof itemId === 'string' ? {} : undefined;
}

function getProviderData(
  part: {
    providerOptions?: Record<string, unknown>;
  },
  providerOptionsName: string,
): Record<string, unknown> | undefined {
  const providerData =
    part.providerOptions?.[providerOptionsName] ??
    (
      part as {
        providerMetadata?: Record<string, unknown>;
      }
    ).providerMetadata?.[providerOptionsName];

  return providerData != null &&
    typeof providerData === 'object' &&
    !Array.isArray(providerData)
    ? (providerData as Record<string, unknown>)
    : undefined;
}

function getImageDetail(
  part: {
    providerOptions?: Record<string, unknown>;
  },
  providerOptionsName: string,
): InputImageContentParam['detail'] {
  const imageDetail = getProviderData(part, providerOptionsName)?.imageDetail;

  return imageDetail === 'low' ||
    imageDetail === 'high' ||
    imageDetail === 'auto'
    ? imageDetail
    : 'auto';
}

function parseReasoningSummary(
  value: unknown,
): ReasoningItemParam['summary'] | undefined {
  if (
    !Array.isArray(value) ||
    !value.every(
      part =>
        part != null &&
        typeof part === 'object' &&
        (part as { type?: unknown }).type === 'summary_text' &&
        typeof (part as { text?: unknown }).text === 'string',
    )
  ) {
    return undefined;
  }

  return value.map(part => ({
    type: 'summary_text',
    text: (part as { text: string }).text,
  }));
}

function parseReasoningContent(
  value: unknown,
): ReasoningItemParam['content'] | undefined {
  if (
    !Array.isArray(value) ||
    !value.every(
      part =>
        part != null &&
        typeof part === 'object' &&
        (part as { type?: unknown }).type === 'reasoning_text' &&
        typeof (part as { text?: unknown }).text === 'string',
    )
  ) {
    return undefined;
  }

  return value.map(part => ({
    type: 'reasoning_text',
    text: (part as { text: string }).text,
  }));
}

function parseOutputTextAnnotations(
  value: unknown,
): OutputTextContentParam['annotations'] | undefined {
  if (
    !Array.isArray(value) ||
    !value.every(
      annotation =>
        annotation != null &&
        typeof annotation === 'object' &&
        (annotation as { type?: unknown }).type === 'url_citation' &&
        typeof (annotation as { start_index?: unknown }).start_index ===
          'number' &&
        typeof (annotation as { end_index?: unknown }).end_index === 'number' &&
        typeof (annotation as { url?: unknown }).url === 'string' &&
        typeof (annotation as { title?: unknown }).title === 'string',
    )
  ) {
    return undefined;
  }

  return value.map(annotation => ({
    type: 'url_citation',
    start_index: (annotation as { start_index: number }).start_index,
    end_index: (annotation as { end_index: number }).end_index,
    url: (annotation as { url: string }).url,
    title: (annotation as { title: string }).title,
  }));
}
>>>>>>> d127e7a2b6 (fix: preserve image detail settings and defaults for Open Responses image inputs (#20503))
