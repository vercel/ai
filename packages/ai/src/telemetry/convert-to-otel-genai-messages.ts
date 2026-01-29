import { LanguageModelV3Prompt } from '@ai-sdk/provider';

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

/**
 * Convert AI SDK language model prompt messages to OTel GenAI message schema.
 * This is used for the `gen_ai.input.messages` attribute.
 *
 * @see https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/
 */
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
          // Note: Images and other content types are not included in OTel schema
          // They could be represented as { type: 'uri', modality: 'image', uri: '...' }
          // but this is not standardized yet
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
              arguments: part.args,
            });
          }
        }
        if (parts.length > 0) {
          messages.push({ role: 'assistant', parts });
        }
        break;
      }

      case 'tool': {
        // Tool results should use role: 'tool', not 'user'
        const parts: OTelGenAIMessagePart[] = [];
        for (const part of message.content) {
          if (part.type === 'tool-result') {
            parts.push({
              type: 'tool_call_response',
              id: part.toolCallId,
              // OTel spec uses 'result', not 'response'
              result:
                typeof part.result === 'string'
                  ? part.result
                  : JSON.stringify(part.result),
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

/**
 * Convert AI SDK response content to OTel GenAI output message schema.
 * This is used for the `gen_ai.output.messages` attribute.
 */
export function convertToOTelGenAIOutputMessages(options: {
  text?: string;
  toolCalls?: Array<{
    toolCallId: string;
    toolName: string;
    args: unknown;
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
        arguments: toolCall.args,
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

/**
 * Convert AI SDK tool definitions to OTel GenAI tool definitions schema.
 * This is used for the `gen_ai.tool.definitions` attribute.
 */
export function convertToOTelGenAIToolDefinitions(
  tools:
    | Array<{
        type: string;
        name: string;
        description?: string;
        parameters?: unknown;
      }>
    | undefined,
): Array<{
  type: string;
  name: string;
  description?: string;
  parameters?: unknown;
}> {
  if (!tools) {
    return [];
  }

  return tools.map(tool => ({
    type: tool.type,
    name: tool.name,
    ...(tool.description ? { description: tool.description } : {}),
    ...(tool.parameters ? { parameters: tool.parameters } : {}),
  }));
}

/**
 * Map AI SDK operation ID to OTel GenAI operation name.
 */
export function getGenAIOperationName(
  operationId: string,
): 'chat' | 'text_completion' | 'embeddings' | string {
  if (
    operationId.includes('generateText') ||
    operationId.includes('streamText')
  ) {
    return 'chat';
  }
  if (
    operationId.includes('generateObject') ||
    operationId.includes('streamObject')
  ) {
    return 'chat'; // Object generation uses chat completion under the hood
  }
  if (operationId.includes('embed')) {
    return 'embeddings';
  }
  return operationId;
}

/**
 * Normalize provider name for OTel GenAI.
 * Maps AI SDK provider identifiers to OTel standard provider names.
 */
export function normalizeProviderName(provider: string): string {
  // Extract base provider name (e.g., 'anthropic.messages' -> 'anthropic')
  const baseName = provider.split('.')[0];

  // Map common variations to standard names
  const providerMap: Record<string, string> = {
    anthropic: 'anthropic',
    openai: 'openai',
    'azure-openai': 'azure.openai',
    azure: 'azure.openai',
    bedrock: 'aws.bedrock',
    'aws-bedrock': 'aws.bedrock',
    google: 'google.vertex_ai',
    vertex: 'google.vertex_ai',
    'vertex-ai': 'google.vertex_ai',
    cohere: 'cohere',
    mistral: 'mistral',
    groq: 'groq',
  };

  return providerMap[baseName] ?? baseName;
}
