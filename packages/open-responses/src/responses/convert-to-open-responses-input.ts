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
}: {
  prompt: LanguageModelV3Prompt;
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
<<<<<<< HEAD
              if (!part.mediaType.startsWith('image/')) {
                warnings.push({
                  type: 'other',
                  message: `unsupported file content type: ${part.mediaType}`,
                });
                break;
=======
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
>>>>>>> 52d2e306b (fix(open-responses): map non-image file parts to input_file (#15212))
              }

              const mediaType =
                part.mediaType === 'image/*' ? 'image/jpeg' : part.mediaType;

              userContent.push({
                type: 'input_image',
                ...(part.data instanceof URL
                  ? { image_url: part.data.toString() }
                  : {
                      image_url: `data:${mediaType};base64,${convertToBase64(part.data)}`,
                    }),
              });
              break;
            }
          }
        }

        input.push({ type: 'message', role: 'user', content: userContent });
        break;
      }

      case 'assistant': {
        const assistantContent: Array<
          OutputTextContentParam | RefusalContentParam
        > = [];
        const toolCalls: Array<FunctionCallItemParam> = [];

        for (const part of content) {
          switch (part.type) {
            case 'text': {
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

        // Push assistant message with text content if any
        if (assistantContent.length > 0) {
          input.push({
            type: 'message',
            role: 'assistant',
            content: assistantContent,
          });
        }

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
                contentValue = output.reason ?? 'Tool execution denied.';
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
