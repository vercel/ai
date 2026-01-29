import {
  LanguageModelV3FunctionTool,
  LanguageModelV3ProviderTool,
  LanguageModelV3Prompt,
  LanguageModelV3ToolResultOutput,
} from '@ai-sdk/provider';

/**
 * OTel GenAI Message Schema
 * @see https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/
 */
export type OTelGenAIMessagePart =
  | { type: 'text'; content: string }
  | { type: 'tool_call'; id: string; name: string; arguments: unknown }
  | { type: 'tool_call_response'; id: string; result: string };

export type OTelGenAIMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  parts: OTelGenAIMessagePart[];
  finish_reason?: string;
};

export function convertToOTelGenAIInputMessages(
  prompt: LanguageModelV3Prompt,
): OTelGenAIMessage[] {
  const messages: OTelGenAIMessage[] = [];

  for (const message of prompt) {
    switch (message.role) {
      case 'system': {
        messages.push({
          role: 'system',
          parts: [{ type: 'text', content: message.content }],
        });
        break;
      }

      case 'user': {
        const parts: OTelGenAIMessagePart[] = [];
        for (const part of message.content) {
          if (part.type === 'text') {
            parts.push({ type: 'text', content: part.text });
          }
        }
        if (parts.length > 0) {
          messages.push({ role: 'user', parts });
        }
        break;
      }

      case 'assistant': {
        const parts: OTelGenAIMessagePart[] = [];
        for (const part of message.content) {
          if (part.type === 'text') {
            parts.push({ type: 'text', content: part.text });
          } else if (part.type === 'tool-call') {
            parts.push({
              type: 'tool_call',
              id: part.toolCallId,
              name: part.toolName,
              arguments: part.input,
            });
          }
        }
        if (parts.length > 0) {
          messages.push({ role: 'assistant', parts });
        }
        break;
      }

      case 'tool': {
        const parts: OTelGenAIMessagePart[] = [];
        for (const part of message.content) {
          if (part.type === 'tool-result') {
            parts.push({
              type: 'tool_call_response',
              id: part.toolCallId,
              result: toolResultOutputToString(part.output),
            });
          }
        }
        if (parts.length > 0) {
          messages.push({ role: 'tool', parts });
        }
        break;
      }
    }
  }

  return messages;
}

export function convertToOTelGenAIOutputMessages(options: {
  text?: string;
  toolCalls?: Array<{
    toolCallId: string;
    toolName: string;
    input: unknown;
  }>;
  finishReason?: string;
}): OTelGenAIMessage[] {
  const { text, toolCalls, finishReason } = options;
  const parts: OTelGenAIMessagePart[] = [];

  if (text) {
    parts.push({ type: 'text', content: text });
  }

  if (toolCalls) {
    for (const toolCall of toolCalls) {
      parts.push({
        type: 'tool_call',
        id: toolCall.toolCallId,
        name: toolCall.toolName,
        arguments: toolCall.input,
      });
    }
  }

  if (parts.length === 0) {
    return [];
  }

  return [
    {
      role: 'assistant',
      parts,
      ...(finishReason ? { finish_reason: finishReason } : {}),
    },
  ];
}

export function convertToOTelGenAIToolDefinitions(
  tools:
    | Array<LanguageModelV3FunctionTool | LanguageModelV3ProviderTool>
    | undefined,
): Array<{
  type: 'function';
  name: string;
  description?: string;
  parameters: LanguageModelV3FunctionTool['inputSchema'];
}> {
  if (!tools) {
    return [];
  }

  const result: Array<{
    type: 'function';
    name: string;
    description?: string;
    parameters: LanguageModelV3FunctionTool['inputSchema'];
  }> = [];

  for (const tool of tools) {
    if (tool.type !== 'function') {
      continue;
    }

    result.push({
      type: 'function',
      name: tool.name,
      ...(tool.description != null ? { description: tool.description } : {}),
      parameters: tool.inputSchema,
    });
  }

  return result;
}

export function getGenAIOperationName(
  operationId: string,
): 'chat' | 'text_completion' | 'embeddings' | string {
  if (
    operationId.startsWith('ai.generateText') ||
    operationId.startsWith('ai.streamText') ||
    operationId.startsWith('ai.generateObject') ||
    operationId.startsWith('ai.streamObject')
  ) {
    return 'chat';
  }
  if (operationId.startsWith('ai.embed')) {
    return 'embeddings';
  }
  return operationId;
}

function toolResultOutputToString(
  output: LanguageModelV3ToolResultOutput,
): string {
  switch (output.type) {
    case 'text':
    case 'error-text':
      return output.value;
    case 'json':
    case 'error-json':
      return JSON.stringify(output.value);
    default:
      return JSON.stringify(output);
  }
}
