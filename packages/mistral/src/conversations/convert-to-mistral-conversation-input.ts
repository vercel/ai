import {
  UnsupportedFunctionalityError,
  type LanguageModelV4Prompt,
  type LanguageModelV4ToolResultOutput,
} from '@ai-sdk/provider';
import {
  convertToBase64,
  getTopLevelMediaType,
  resolveFullMediaType,
  type ToolNameMapping,
} from '@ai-sdk/provider-utils';

type MistralConversationContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: string }
  | { type: 'document_url'; document_url: string };

export type MistralConversationInput =
  | {
      type: 'message.input';
      role: 'user';
      content: MistralConversationContentPart[];
    }
  | {
      type: 'message.output';
      role: 'assistant';
      content: Array<{ type: 'text'; text: string }>;
    }
  | {
      type: 'function.call';
      tool_call_id: string;
      name: string;
      arguments: string;
    }
  | {
      type: 'function.result';
      tool_call_id: string;
      result: string;
    }
  | {
      type: 'tool.execution';
      id: string;
      name: string;
      arguments: string;
      info?: Record<string, unknown>;
    };

export function convertToMistralConversationInput({
  prompt,
  toolNameMapping,
}: {
  prompt: LanguageModelV4Prompt;
  toolNameMapping: ToolNameMapping;
}): {
  inputs: MistralConversationInput[];
  instructions: string | undefined;
} {
  const inputs: MistralConversationInput[] = [];
  const instructions: string[] = [];

  for (const message of prompt) {
    switch (message.role) {
      case 'system':
        instructions.push(message.content);
        break;

      case 'user':
        inputs.push({
          type: 'message.input',
          role: 'user',
          content: message.content.map(part => {
            if (part.type === 'text') {
              return { type: 'text', text: part.text };
            }

            if (part.data.type === 'reference') {
              throw new UnsupportedFunctionalityError({
                functionality: 'file parts with provider references',
              });
            }

            if (part.data.type === 'text') {
              throw new UnsupportedFunctionalityError({
                functionality: 'text file parts',
              });
            }

            const data =
              part.data.type === 'url'
                ? part.data.url.toString()
                : `data:${resolveFullMediaType({ part })};base64,${convertToBase64(part.data.data)}`;

            if (getTopLevelMediaType(part.mediaType) === 'image') {
              return { type: 'image_url', image_url: data };
            }

            const fullMediaType =
              part.data.type === 'data'
                ? resolveFullMediaType({ part })
                : part.mediaType;

            if (fullMediaType !== 'application/pdf') {
              throw new UnsupportedFunctionalityError({
                functionality: 'Only images and PDF file parts are supported',
              });
            }

            return { type: 'document_url', document_url: data };
          }),
        });
        break;

      case 'assistant': {
        const providerExecutedToolCallIds = new Set(
          message.content.flatMap(part =>
            part.type === 'tool-call' && part.providerExecuted
              ? [part.toolCallId]
              : [],
          ),
        );
        const providerToolResults = new Map<
          string,
          LanguageModelV4ToolResultOutput
        >();

        for (const part of message.content) {
          if (
            part.type === 'tool-result' &&
            providerExecutedToolCallIds.has(part.toolCallId)
          ) {
            providerToolResults.set(part.toolCallId, part.output);
          }
        }

        let text = '';

        const flushText = () => {
          if (text.length === 0) {
            return;
          }

          inputs.push({
            type: 'message.output',
            role: 'assistant',
            content: [{ type: 'text', text }],
          });
          text = '';
        };

        for (const part of message.content) {
          switch (part.type) {
            case 'text':
            case 'reasoning':
              text += part.text;
              break;

            case 'tool-call': {
              flushText();

              if (part.providerExecuted) {
                const output = providerToolResults.get(part.toolCallId);
                inputs.push({
                  type: 'tool.execution',
                  id: part.toolCallId,
                  name: toolNameMapping.toProviderToolName(part.toolName),
                  arguments: JSON.stringify(part.input),
                  info: getToolExecutionInfo(output),
                });
              } else {
                inputs.push({
                  type: 'function.call',
                  tool_call_id: part.toolCallId,
                  name: part.toolName,
                  arguments: JSON.stringify(part.input),
                });
              }
              break;
            }

            case 'tool-result':
              if (!providerExecutedToolCallIds.has(part.toolCallId)) {
                inputs.push({
                  type: 'function.result',
                  tool_call_id: part.toolCallId,
                  result: stringifyToolResult(part.output),
                });
              }
              break;

            case 'file':
            case 'reasoning-file':
            case 'custom':
              throw new UnsupportedFunctionalityError({
                functionality: `${part.type} parts in assistant messages`,
              });
          }
        }

        flushText();
        break;
      }

      case 'tool':
        for (const part of message.content) {
          if (part.type === 'tool-approval-response') {
            continue;
          }

          inputs.push({
            type: 'function.result',
            tool_call_id: part.toolCallId,
            result: stringifyToolResult(part.output),
          });
        }
        break;
    }
  }

  return {
    inputs,
    instructions:
      instructions.length > 0 ? instructions.join('\n\n') : undefined,
  };
}

function stringifyToolResult(output: LanguageModelV4ToolResultOutput): string {
  switch (output.type) {
    case 'text':
    case 'error-text':
      return output.value;
    case 'execution-denied':
      return output.reason ?? 'Tool call execution denied.';
    case 'content':
    case 'json':
    case 'error-json':
      return JSON.stringify(output.value);
  }
}

function getToolExecutionInfo(
  output: LanguageModelV4ToolResultOutput | undefined,
): Record<string, unknown> | undefined {
  if (output?.type !== 'json') {
    return undefined;
  }

  const value = output.value;
  if (
    value != null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'info' in value &&
    value.info != null &&
    typeof value.info === 'object' &&
    !Array.isArray(value.info)
  ) {
    return value.info as Record<string, unknown>;
  }

  return undefined;
}
