import {
  UnsupportedFunctionalityError,
  type LanguageModelV4Prompt,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  convertToBase64,
  getTopLevelMediaType,
  resolveFullMediaType,
} from '@ai-sdk/provider-utils';
import type {
  FunctionCallOutputItemParam,
  InputFileContentParam,
  InputImageContentParam,
  InputTextContentParam,
  OpenResponsesRequestBody,
  OutputTextContentParam,
  ReasoningItemParam,
  RefusalContentParam,
} from './open-responses-api';

export async function convertToOpenResponsesInput({
  prompt,
  providerOptionsName = 'open-responses',
}: {
  prompt: LanguageModelV4Prompt;
  providerOptionsName?: string;
}): Promise<{
  input: OpenResponsesRequestBody['input'];
  instructions: string | undefined;
  warnings: Array<SharedV4Warning>;
}> {
  const input: OpenResponsesRequestBody['input'] = [];
  const warnings: Array<SharedV4Warning> = [];
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
              switch (part.data.type) {
                case 'reference': {
                  throw new UnsupportedFunctionalityError({
                    functionality: 'file parts with provider references',
                  });
                }
                case 'text': {
                  throw new UnsupportedFunctionalityError({
                    functionality: 'text file parts',
                  });
                }
                case 'url':
                case 'data': {
                  const topLevel = getTopLevelMediaType(part.mediaType);

                  if (topLevel === 'image') {
                    userContent.push({
                      type: 'input_image',
                      ...(part.data.type === 'url'
                        ? { image_url: part.data.url.toString() }
                        : {
                            image_url: `data:${resolveFullMediaType({ part })};base64,${convertToBase64(part.data.data)}`,
                          }),
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
        let assistantMessageId: string | undefined;

        const flushAssistantContent = () => {
          if (assistantContent.length === 0) {
            return;
          }

          input.push({
            type: 'message',
            role: 'assistant',
            content: assistantContent,
            ...(assistantMessageId != null && { id: assistantMessageId }),
          });
          assistantContent = [];
          assistantMessageId = undefined;
        };

        for (const part of content) {
          switch (part.type) {
            case 'reasoning': {
              flushAssistantContent();

              const providerData = getProviderData(part, providerOptionsName);
              const itemId =
                typeof providerData?.itemId === 'string'
                  ? providerData.itemId
                  : undefined;
              const summary = parseReasoningSummary(
                providerData?.reasoningSummary,
              );
              const reasoningContent = parseReasoningContent(
                providerData?.reasoningContent,
              );
              const hasReasoningContent =
                providerData != null && 'reasoningContent' in providerData;
              const encryptedContent =
                typeof providerData?.reasoningEncryptedContent === 'string'
                  ? providerData.reasoningEncryptedContent
                  : undefined;

              const reasoningItem: ReasoningItemParam = {
                type: 'reasoning',
                summary: summary ?? [],
                ...(itemId != null && { id: itemId }),
                ...(reasoningContent != null
                  ? { content: reasoningContent }
                  : !hasReasoningContent && part.text.length > 0
                    ? {
                        content: [
                          {
                            type: 'reasoning_text' as const,
                            text: part.text,
                          },
                        ],
                      }
                    : {}),
                ...(encryptedContent != null && {
                  encrypted_content: encryptedContent,
                }),
              };
              const previousItem = input[input.length - 1];

              if (
                reasoningItem.id != null &&
                previousItem?.type === 'reasoning' &&
                previousItem.id === reasoningItem.id
              ) {
                if (reasoningItem.content != null) {
                  previousItem.content = [
                    ...(previousItem.content ?? []),
                    ...reasoningItem.content,
                  ];
                }
              } else {
                input.push(reasoningItem);
              }
              break;
            }
            case 'text': {
              const providerData = getProviderData(part, providerOptionsName);
              const itemId =
                typeof providerData?.itemId === 'string'
                  ? providerData.itemId
                  : undefined;
              const annotations = parseOutputTextAnnotations(
                providerData?.annotations,
              );

              if (
                assistantContent.length > 0 &&
                assistantMessageId !== itemId
              ) {
                flushAssistantContent();
              }

              assistantMessageId = itemId;
              assistantContent.push({
                type: 'output_text',
                text: part.text,
                ...(annotations != null && { annotations }),
              });
              break;
            }
            case 'tool-call': {
              flushAssistantContent();

              const argumentsValue =
                typeof part.input === 'string'
                  ? part.input
                  : JSON.stringify(part.input);
              const providerData = getProviderData(part, providerOptionsName);
              const itemId =
                typeof providerData?.itemId === 'string'
                  ? providerData.itemId
                  : undefined;

              input.push({
                type: 'function_call',
                ...(itemId != null && { id: itemId }),
                call_id: part.toolCallId,
                name: part.toolName,
                arguments: argumentsValue,
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
