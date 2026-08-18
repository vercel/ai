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

type AgentInputItem = Record<string, unknown>;

export async function convertToPerplexityAgentInput({
  prompt,
}: {
  prompt: LanguageModelV4Prompt;
}): Promise<{
  input: AgentInputItem[];
  instructions: string | undefined;
  warnings: SharedV4Warning[];
}> {
  const input: AgentInputItem[] = [];
  const instructions: string[] = [];
  const warnings: SharedV4Warning[] = [];

  for (const message of prompt) {
    switch (message.role) {
      case 'system': {
        instructions.push(message.content);
        break;
      }

      case 'user': {
        const content: AgentInputItem[] = [];

        for (const part of message.content) {
          if (part.type === 'text') {
            content.push({ type: 'input_text', text: part.text });
            continue;
          }

          switch (part.data.type) {
            case 'reference':
              throw new UnsupportedFunctionalityError({
                functionality: 'file parts with provider references',
              });
            case 'text':
              throw new UnsupportedFunctionalityError({
                functionality: 'text file parts',
              });
            case 'url': {
              if (getTopLevelMediaType(part.mediaType) === 'image') {
                content.push({
                  type: 'input_image',
                  image_url: part.data.url.toString(),
                });
              } else {
                content.push({
                  type: 'input_file',
                  file_url: part.data.url.toString(),
                });
              }
              break;
            }
            case 'data': {
              const mediaType = resolveFullMediaType({ part });
              const dataUrl = `data:${mediaType};base64,${convertToBase64(
                part.data.data,
              )}`;

              if (getTopLevelMediaType(part.mediaType) === 'image') {
                content.push({ type: 'input_image', image_url: dataUrl });
              } else {
                content.push({
                  type: 'input_file',
                  filename: part.filename ?? 'data',
                  file_data: dataUrl,
                });
              }
              break;
            }
          }
        }

        input.push({ type: 'message', role: 'user', content });
        break;
      }

      case 'assistant': {
        const content: AgentInputItem[] = [];

        const flushContent = () => {
          if (content.length > 0) {
            input.push({
              type: 'message',
              role: 'assistant',
              content: content.splice(0),
            });
          }
        };

        for (const part of message.content) {
          switch (part.type) {
            case 'text':
              content.push({ type: 'output_text', text: part.text });
              break;
            case 'reasoning':
              warnings.push({
                type: 'unsupported',
                feature: 'reasoning content in prompt',
              });
              break;
            case 'tool-call':
              flushContent();
              input.push({
                type: 'function_call',
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

        flushContent();
        break;
      }

      case 'tool': {
        for (const part of message.content) {
          if (part.type !== 'tool-result') {
            continue;
          }

          let output: string;
          switch (part.output.type) {
            case 'text':
            case 'error-text':
              output = part.output.value;
              break;
            case 'execution-denied':
              output = part.output.reason ?? 'Tool call execution was denied.';
              break;
            case 'json':
            case 'error-json':
              output = JSON.stringify(part.output.value);
              break;
            case 'content':
              output = JSON.stringify(part.output.value);
              break;
          }

          input.push({
            type: 'function_call_output',
            call_id: part.toolCallId,
            output,
          });
        }
        break;
      }
    }
  }

  return {
    input,
    instructions: instructions.length > 0 ? instructions.join('\n') : undefined,
    warnings,
  };
}
