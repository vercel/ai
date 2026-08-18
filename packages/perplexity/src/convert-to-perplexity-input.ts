import {
  UnsupportedFunctionalityError,
  type LanguageModelV4Prompt,
  type LanguageModelV4ToolResultOutput,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  convertUint8ArrayToBase64,
  getTopLevelMediaType,
  resolveFullMediaType,
} from '@ai-sdk/provider-utils';
import type {
  PerplexityAgentInput,
  PerplexityAgentInputContent,
} from './perplexity-language-model-prompt';

function serializeToolOutput(output: LanguageModelV4ToolResultOutput): string {
  switch (output.type) {
    case 'text':
    case 'error-text':
      return output.value;
    case 'json':
    case 'error-json':
      return JSON.stringify(output.value);
    case 'execution-denied':
      return output.reason ?? 'Tool call execution denied.';
    case 'content': {
      if (output.value.some(part => part.type !== 'text')) {
        throw new UnsupportedFunctionalityError({
          functionality: 'file and custom tool result content',
        });
      }
      return output.value
        .map(part => (part.type === 'text' ? part.text : ''))
        .join('');
    }
    default: {
      const _exhaustiveCheck: never = output;
      throw new Error(`Unsupported tool output: ${_exhaustiveCheck}`);
    }
  }
}

function getThoughtSignature(
  providerOptions:
    | Record<string, Record<string, unknown> | undefined>
    | undefined,
): string | undefined {
  return providerOptions?.perplexity?.thoughtSignature as string | undefined;
}

export function convertToPerplexityInput(prompt: LanguageModelV4Prompt): {
  input: PerplexityAgentInput;
  warnings: SharedV4Warning[];
} {
  const input: PerplexityAgentInput = [];
  const warnings: SharedV4Warning[] = [];

  for (const { role, content } of prompt) {
    switch (role) {
      case 'system': {
        input.push({ type: 'message', role: 'system', content });
        break;
      }

      case 'user': {
        const convertedContent: PerplexityAgentInputContent[] = content.map(
          part => {
            switch (part.type) {
              case 'text':
                return { type: 'input_text', text: part.text };
              case 'file': {
                if (getTopLevelMediaType(part.mediaType) !== 'image') {
                  throw new UnsupportedFunctionalityError({
                    functionality: `file part media type ${part.mediaType}`,
                  });
                }

                switch (part.data.type) {
                  case 'url':
                    return {
                      type: 'input_image',
                      image_url: part.data.url.toString(),
                    };
                  case 'data':
                    return {
                      type: 'input_image',
                      image_url: `data:${resolveFullMediaType({ part })};base64,${
                        typeof part.data.data === 'string'
                          ? part.data.data
                          : convertUint8ArrayToBase64(part.data.data)
                      }`,
                    };
                  case 'reference':
                    throw new UnsupportedFunctionalityError({
                      functionality: 'file parts with provider references',
                    });
                  case 'text':
                    throw new UnsupportedFunctionalityError({
                      functionality: 'text file parts',
                    });
                }
              }
            }
          },
        );

        const isTextOnly = convertedContent.every(
          part => part.type === 'input_text',
        );
        input.push({
          type: 'message',
          role: 'user',
          content: isTextOnly
            ? convertedContent
                .map(part => (part.type === 'input_text' ? part.text : ''))
                .join('')
            : convertedContent,
        });
        break;
      }

      case 'assistant': {
        const text = content
          .filter(part => part.type === 'text')
          .map(part => part.text)
          .join('');

        if (text.length > 0) {
          input.push({ type: 'message', role: 'assistant', content: text });
        }

        for (const part of content) {
          switch (part.type) {
            case 'text':
              break;
            case 'tool-call':
              input.push({
                type: 'function_call',
                call_id: part.toolCallId,
                name: part.toolName,
                arguments: JSON.stringify(part.input ?? {}),
                thought_signature: getThoughtSignature(part.providerOptions),
              });
              break;
            case 'tool-result':
              input.push({
                type: 'function_call_output',
                call_id: part.toolCallId,
                name: part.toolName,
                output: serializeToolOutput(part.output),
                thought_signature: getThoughtSignature(part.providerOptions),
              });
              break;
            case 'reasoning':
              warnings.push({
                type: 'unsupported',
                feature: 'reasoning content in prompt',
              });
              break;
            case 'file':
            case 'reasoning-file':
            case 'custom':
              throw new UnsupportedFunctionalityError({
                functionality: `assistant ${part.type} parts`,
              });
            default: {
              const _exhaustiveCheck: never = part;
              throw new Error(
                `Unsupported assistant part: ${_exhaustiveCheck}`,
              );
            }
          }
        }
        break;
      }

      case 'tool': {
        for (const part of content) {
          if (part.type === 'tool-approval-response') {
            throw new UnsupportedFunctionalityError({
              functionality: 'tool approval responses',
            });
          }

          input.push({
            type: 'function_call_output',
            call_id: part.toolCallId,
            name: part.toolName,
            output: serializeToolOutput(part.output),
            thought_signature: getThoughtSignature(part.providerOptions),
          });
        }
        break;
      }

      default: {
        const _exhaustiveCheck: never = role;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }

  return { input, warnings };
}
