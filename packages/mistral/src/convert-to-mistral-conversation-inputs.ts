import {
  UnsupportedFunctionalityError,
  type JSONValue,
  type LanguageModelV4Prompt,
  type LanguageModelV4ToolResultPart,
} from '@ai-sdk/provider';
import type { ToolNameMapping } from '@ai-sdk/provider-utils';
import { convertToMistralChatMessages } from './convert-to-mistral-chat-messages';
import type {
  MistralAssistantMessageContent,
  MistralToolMessage,
  MistralUserMessageContent,
} from './mistral-chat-prompt';

type ConversationInput =
  | {
      type: 'message.input';
      role: 'user' | 'assistant';
      content: Array<
        MistralUserMessageContent | MistralAssistantMessageContent
      >;
    }
  | {
      type: 'function.call';
      tool_call_id: string;
      name: string;
      arguments: string;
    }
  | { type: 'function.result'; tool_call_id: string; result: string };

export function convertToMistralConversationInputs(
  prompt: LanguageModelV4Prompt,
  toolNameMapping: ToolNameMapping,
) {
  const inputs: ConversationInput[] = [];
  const instructions: string[] = [];
  const executions = new Set<string>();
  const appendToolResult = (part: LanguageModelV4ToolResultPart) => {
    if (executions.has(part.toolCallId)) {
      let result: JSONValue = null;
      if (part.output.type === 'json') {
        const value = part.output.value;
        const info =
          value != null && typeof value === 'object' && 'info' in value
            ? value.info
            : undefined;
        if (info != null && typeof info === 'object' && !Array.isArray(info)) {
          result = 'result' in info ? (info.result ?? info) : info;
        }
      }
      inputs.push({
        type: 'function.result',
        tool_call_id: part.toolCallId,
        result: typeof result === 'string' ? result : JSON.stringify(result),
      });
      return;
    }
    const converted = convertToMistralChatMessages([
      { role: 'tool', content: [part] },
    ])[0] as MistralToolMessage;
    inputs.push({
      type: 'function.result',
      tool_call_id: part.toolCallId,
      result: converted.content,
    });
  };

  for (const message of prompt) {
    switch (message.role) {
      case 'system':
        instructions.push(message.content);
        break;
      case 'user': {
        const converted = convertToMistralChatMessages([message])[0];
        if (converted.role === 'user') {
          inputs.push({
            type: 'message.input',
            role: 'user',
            content: converted.content,
          });
        }
        break;
      }
      case 'assistant': {
        let content: MistralAssistantMessageContent[] = [];
        const flush = () => {
          if (content.length > 0) {
            inputs.push({ type: 'message.input', role: 'assistant', content });
            content = [];
          }
        };
        for (const part of message.content) {
          switch (part.type) {
            case 'text':
              content.push({ type: 'text', text: part.text });
              break;
            case 'reasoning':
              content.push({
                type: 'thinking',
                thinking: [{ type: 'text', text: part.text }],
                closed: true,
              });
              break;
            case 'tool-call': {
              flush();
              if (part.providerExecuted) {
                const name =
                  part.providerOptions?.mistral?.function ??
                  part.providerOptions?.mistral?.name;
                const args = part.input as { arguments?: unknown } | null;
                // Replay built-in executions as calls and results. Entry IDs
                // and tool.execution output entries cannot be sent as inputs.
                inputs.push({
                  type: 'function.call',
                  tool_call_id: part.toolCallId,
                  name:
                    typeof name === 'string'
                      ? name
                      : toolNameMapping.toProviderToolName(part.toolName),
                  arguments:
                    typeof args?.arguments === 'string'
                      ? args.arguments
                      : JSON.stringify(part.input),
                });
                executions.add(part.toolCallId);
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
              flush();
              appendToolResult(part);
              break;
            default:
              throw new UnsupportedFunctionalityError({
                functionality: `assistant content type: ${part.type}`,
              });
          }
        }
        flush();
        break;
      }
      case 'tool':
        for (const part of message.content) {
          if (part.type === 'tool-approval-response') {
            continue;
          }
          appendToolResult(part);
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
