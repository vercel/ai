import { LanguageModelV3Prompt, SharedV3Warning } from '@ai-sdk/provider';
import {
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
  warnings: Array<SharedV3Warning>;
}> {
  const input: OpenResponsesRequestBody['input'] = [];
  const warnings: Array<SharedV3Warning> = [];

  for (const { role, content } of prompt) {
    switch (role) {
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
              toolCalls.push({
                type: 'function_call',
                call_id: part.toolCallId,
                name: part.toolName,
                arguments: JSON.stringify(part.input),
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
              case 'content':
                contentValue = output.value
                  .map(item => {
                    switch (item.type) {
                      case 'text': {
                        return { type: 'input_text' as const, text: item.text };
                      }
                      case 'image-data': {
                        return {
                          type: 'input_image' as const,
                          image_url: `data:${item.mediaType};base64,${item.data}`,
                        };
                      }
                      case 'image-url': {
                        return {
                          type: 'input_image' as const,
                          image_url: item.url,
                        };
                      }
                      case 'file-data': {
                        return {
                          type: 'input_file' as const,
                          filename: item.filename ?? 'data',
                          file_data: `data:${item.mediaType};base64,${item.data}`,
                        };
                      }
                      default: {
                        warnings.push({
                          type: 'other',
                          message: `unsupported tool content part type: ${(item as { type: string }).type}`,
                        });
                        return undefined;
                      }
                    }
                  })
                  .filter(
                    (
                      item,
                    ): item is
                      | InputTextContentParam
                      | InputImageContentParam
                      | InputFileContentParam => item !== undefined,
                  );
                break;
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

  return { input, warnings };
}
