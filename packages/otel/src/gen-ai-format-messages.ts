import {
  getErrorMessage,
  type LanguageModelV4CustomPart,
  type LanguageModelV4FilePart,
  type LanguageModelV4Message,
  type LanguageModelV4Prompt,
  type LanguageModelV4ReasoningFilePart,
  type LanguageModelV4ReasoningPart,
  type LanguageModelV4TextPart,
  type LanguageModelV4ToolApprovalResponsePart,
  type LanguageModelV4ToolCallPart,
  type LanguageModelV4ToolResultPart,
} from '@ai-sdk/provider';
import type { ModelMessage } from '@ai-sdk/provider-utils';
import {
  convertDataContentToBase64String,
  type ContentPart,
  type ToolSet,
} from 'ai';

type LanguageModelV4ContentPart =
  | LanguageModelV4TextPart
  | LanguageModelV4FilePart
  | LanguageModelV4CustomPart
  | LanguageModelV4ReasoningPart
  | LanguageModelV4ReasoningFilePart
  | LanguageModelV4ToolCallPart
  | LanguageModelV4ToolResultPart
  | LanguageModelV4ToolApprovalResponsePart;

export type SemConvPart =
  | { type: 'text'; content: string }
  | { type: 'reasoning'; content: string }
  | {
      type: 'tool_call';
      id: string | null;
      name: string;
      arguments?: unknown;
    }
  | {
      type: 'tool_call_response';
      id: string | null;
      response: unknown;
    }
  | {
      type: 'blob';
      modality: string;
      mime_type: string | null;
      content: string;
    }
  | { type: string; [key: string]: unknown };

export interface SemConvInputMessage {
  role: string;
  parts: SemConvPart[];
}

export interface SemConvOutputMessage {
  role: string;
  parts: SemConvPart[];
  finish_reason: string;
}

export interface SemConvSystemInstruction {
  type: string;
  content?: string;
  [key: string]: unknown;
}

/**
 * Maps an AI SDK provider string (e.g. "anthropic.messages", "openai.chat")
 * to a well-known gen_ai.provider.name value per the OTel GenAI SemConv.
 *
 * Provider strings come in formats like:
 *   "openai.chat", "google.generative-ai", "google.vertex.chat",
 *   "google-vertex", "amazon-bedrock.chat", "azure.chat"
 *
 * We match against longest-prefix-first to handle multi-segment prefixes
 * like "google.vertex" and "google.generative-ai" before the single-segment "google".
 */
export function mapProviderName(provider: string): string {
  const lower = provider.toLowerCase();

  const wellKnownPrefixes: Array<[string, string]> = [
    ['google.vertex', 'gcp.vertex_ai'],
    ['google.generative-ai', 'gcp.gemini'],
    ['google-vertex', 'gcp.vertex_ai'],
    ['amazon-bedrock', 'aws.bedrock'],
    ['azure-openai', 'azure.ai.openai'],
    ['anthropic', 'anthropic'],
    ['openai', 'openai'],
    ['azure', 'azure.ai.inference'],
    ['google', 'gcp.gemini'],
    ['mistral', 'mistral_ai'],
    ['cohere', 'cohere'],
    ['bedrock', 'aws.bedrock'],
    ['groq', 'groq'],
    ['deepseek', 'deepseek'],
    ['perplexity', 'perplexity'],
    ['xai', 'x_ai'],
  ];

  for (const [prefix, mapped] of wellKnownPrefixes) {
    if (
      lower === prefix ||
      lower.startsWith(prefix + '.') ||
      lower.startsWith(prefix + '-')
    ) {
      return mapped;
    }
  }

  return provider;
}

/**
 * Maps an AI SDK operationId to a gen_ai.operation.name value.
 */
export function mapOperationName(operationId: string): string {
  const mapping: Record<string, string> = {
    'ai.generateText': 'invoke_agent',
    'ai.streamText': 'invoke_agent',
    'ai.generateObject': 'invoke_agent',
    'ai.streamObject': 'invoke_agent',
    'ai.workflowAgent.stream': 'invoke_agent',
    'ai.embed': 'embeddings',
    'ai.embedMany': 'embeddings',
    'ai.rerank': 'rerank',
    'ai.generateSpeech': 'ai.generateSpeech',
    'ai.transcribe': 'ai.transcribe',
    'ai.streamTranscribe': 'ai.streamTranscribe',
  };
  return mapping[operationId] ?? operationId;
}

/**
 * Converts a system value to the gen_ai.system_instructions SemConv format.
 * Accepts a plain string, a single SystemModelMessage, or an array of them.
 * Schema: array of parts, each with at least { type, content }.
 */
export function formatSystemInstructions(
  system:
    | string
    | { role: 'system'; content: string }
    | Array<{ role: 'system'; content: string }>,
): SemConvSystemInstruction[] {
  if (typeof system === 'string') {
    return [{ type: 'text', content: system }];
  }
  if (Array.isArray(system)) {
    return system.map(msg => ({ type: 'text', content: msg.content }));
  }
  return [{ type: 'text', content: system.content }];
}

function convertMessagePartToSemConv(
  part: LanguageModelV4ContentPart,
): SemConvPart {
  switch (part.type) {
    case 'text':
      return { type: 'text', content: part.text };

    case 'reasoning':
      return { type: 'reasoning', content: part.text };

    case 'tool-call':
      return {
        type: 'tool_call',
        id: part.toolCallId ?? null,
        name: part.toolName,
        arguments: part.input,
      };

    case 'tool-result':
      return {
        type: 'tool_call_response',
        id: part.toolCallId ?? null,
        response: convertToolResultOutputToResponse(part.output),
      };

    case 'file':
    case 'reasoning-file':
      return convertFileDataToSemConv({
        data: part.data,
        mediaType: part.mediaType,
      });

    case 'tool-approval-response':
      return {
        type: 'tool_approval_response',
        approval_id: part.approvalId,
        approved: part.approved,
        reason: part.reason,
      };

    case 'custom':
      return { type: 'custom', kind: part.kind };

    default: {
      const _exhaustive: never = part;
      return { type: String((_exhaustive as { type: string }).type) };
    }
  }
}

function convertToolResultOutputToResponse(output: unknown): unknown {
  if (output == null || typeof output !== 'object' || !('type' in output)) {
    return output;
  }

  const typedOutput = output as {
    type: string;
    value?: unknown;
    reason?: string;
  };

  switch (typedOutput.type) {
    case 'text':
    case 'error-text':
    case 'json':
    case 'error-json':
      return typedOutput.value;
    case 'execution-denied':
      return { denied: true, reason: typedOutput.reason };
    default:
      return output;
  }
}

function convertFileDataToSemConv({
  data: rawData,
  mediaType,
}: {
  data: unknown;
  mediaType: string | undefined;
}): SemConvPart {
  const data: string | Uint8Array | URL | ArrayBuffer = (() => {
    if (
      typeof rawData === 'object' &&
      rawData !== null &&
      !(rawData instanceof URL) &&
      !(rawData instanceof Uint8Array) &&
      !(rawData instanceof ArrayBuffer) &&
      'type' in rawData
    ) {
      const fileData = rawData as
        | { type: 'data'; data: string | Uint8Array | ArrayBuffer }
        | { type: 'url'; url: URL }
        | { type: 'reference'; reference: Record<string, string> }
        | { type: 'text'; text: string };

      switch (fileData.type) {
        case 'data':
          return fileData.data;
        case 'url':
          return fileData.url;
        case 'text':
          return fileData.text;
        default:
          return '';
      }
    }
    return rawData as string | Uint8Array | URL | ArrayBuffer;
  })();

  if (
    data instanceof URL ||
    (typeof data === 'string' &&
      (data.startsWith('http://') || data.startsWith('https://')))
  ) {
    return {
      type: 'uri',
      modality: getModality(mediaType),
      mime_type: mediaType ?? null,
      uri: data.toString(),
    };
  }

  return {
    type: 'blob',
    modality: getModality(mediaType),
    mime_type: mediaType ?? null,
    content: convertDataContentToBase64String(data),
  };
}

function getModality(mediaType: string | undefined): string {
  if (!mediaType) return 'image';
  if (mediaType.startsWith('image/')) return 'image';
  if (mediaType.startsWith('video/')) return 'video';
  if (mediaType.startsWith('audio/')) return 'audio';
  return 'image';
}

/**
 * Converts a LanguageModelV4Prompt to the gen_ai.input.messages SemConv format.
 * Messages are preserved in the order they were sent to the model.
 */
export function formatInputMessages(
  prompt: LanguageModelV4Prompt,
): SemConvInputMessage[] {
  return prompt.map((message: LanguageModelV4Message) => {
    if (message.role === 'system') {
      return {
        role: 'system',
        parts: [{ type: 'text', content: message.content }],
      };
    }

    const parts = message.content.map(convertMessagePartToSemConv);
    return { role: message.role, parts };
  });
}

/**
 * Converts user-facing ModelMessage[] (and optional prompt string) to the
 * gen_ai.input.messages SemConv format while preserving message order.
 */
export function formatModelMessages({
  prompt,
  messages,
}: {
  prompt: string | Array<ModelMessage> | undefined;
  messages: Array<ModelMessage> | undefined;
}): SemConvInputMessage[] {
  const result: SemConvInputMessage[] = [];

  if (typeof prompt === 'string') {
    result.push({
      role: 'user',
      parts: [{ type: 'text', content: prompt }],
    });
  } else if (Array.isArray(prompt)) {
    for (const msg of prompt) {
      const converted = convertModelMessageToSemConv(msg);
      if (converted) result.push(converted);
    }
  }

  if (messages) {
    for (const msg of messages) {
      const converted = convertModelMessageToSemConv(msg);
      if (converted) result.push(converted);
    }
  }

  return result;
}

function convertModelMessageToSemConv(msg: ModelMessage): SemConvInputMessage {
  if (msg.role === 'system') {
    return {
      role: 'system',
      parts: [{ type: 'text', content: msg.content }],
    };
  }

  if (msg.role === 'user') {
    if (typeof msg.content === 'string') {
      return {
        role: 'user',
        parts: [{ type: 'text', content: msg.content }],
      };
    }
    const parts: SemConvPart[] = msg.content.map(part => {
      switch (part.type) {
        case 'text':
          return { type: 'text' as const, content: part.text };
        case 'image': {
          const data = part.image;
          if (data instanceof URL) {
            return {
              type: 'uri' as const,
              modality: 'image',
              mime_type: part.mediaType ?? null,
              uri: data.toString(),
            };
          }
          if (typeof data === 'string') {
            if (data.startsWith('http://') || data.startsWith('https://')) {
              return {
                type: 'uri' as const,
                modality: 'image',
                mime_type: part.mediaType ?? null,
                uri: data,
              };
            }
            return {
              type: 'blob' as const,
              modality: 'image',
              mime_type: part.mediaType ?? null,
              content: data,
            };
          }
          return {
            type: 'blob' as const,
            modality: 'image',
            mime_type: part.mediaType ?? null,
            content: convertDataContentToBase64String(data as Uint8Array),
          };
        }
        case 'file':
          return convertFileDataToSemConv({
            data: part.data,
            mediaType: part.mediaType,
          });
        default:
          return { type: String((part as { type: string }).type) };
      }
    });
    return { role: 'user', parts };
  }

  if (msg.role === 'assistant') {
    if (typeof msg.content === 'string') {
      return {
        role: 'assistant',
        parts: [{ type: 'text', content: msg.content }],
      };
    }
    const parts: SemConvPart[] = msg.content.map(part => {
      switch (part.type) {
        case 'text':
          return { type: 'text' as const, content: part.text };
        case 'reasoning':
          return { type: 'reasoning' as const, content: part.text };
        case 'file':
        case 'reasoning-file':
          return convertFileDataToSemConv({
            data: part.data,
            mediaType: part.mediaType,
          });
        case 'custom':
          return { type: 'custom', kind: part.kind };
        case 'tool-call':
          return {
            type: 'tool_call' as const,
            id: part.toolCallId ?? null,
            name: part.toolName,
            arguments: part.input,
          };
        case 'tool-result':
          return {
            type: 'tool_call_response' as const,
            id: part.toolCallId ?? null,
            response: convertToolResultOutputToResponse(part.output),
          };
        case 'tool-approval-request':
          return {
            type: 'tool_approval_request',
            approval_id: part.approvalId,
            tool_call_id: part.toolCallId,
            reason: part.reason,
          };
        default:
          return { type: String((part as { type: string }).type) };
      }
    });
    return { role: 'assistant', parts };
  }

  if (msg.role === 'tool') {
    const parts: SemConvPart[] = msg.content.map(part => {
      switch (part.type) {
        case 'tool-result':
          return {
            type: 'tool_call_response' as const,
            id: part.toolCallId ?? null,
            response: convertToolResultOutputToResponse(part.output),
          };
        case 'tool-approval-response':
          return {
            type: 'tool_approval_response',
            approval_id: part.approvalId,
            approved: part.approved,
            reason: part.reason,
          };
        default:
          return { type: String((part as { type: string }).type) };
      }
    });
    return { role: 'tool', parts };
  }

  const _exhaustive: never = msg;
  return _exhaustive;
}

/**
 * Extracts the system instruction from a LanguageModelV4Prompt if present.
 */
export function extractSystemFromPrompt(
  prompt: LanguageModelV4Prompt,
): string | undefined {
  const systemMsg = prompt.find(msg => msg.role === 'system');
  if (systemMsg && systemMsg.role === 'system') {
    return systemMsg.content;
  }
}

/**
 * Converts content parts produced by a model call or step to the
 * gen_ai.output.messages SemConv format.
 * Parts are preserved in the order they were produced.
 */
export function formatOutputContent({
  content,
  finishReason,
}: {
  content: ReadonlyArray<ContentPart<ToolSet>>;
  finishReason: string;
}): SemConvOutputMessage[] {
  const parts: SemConvPart[] = [];

  for (const part of content) {
    switch (part.type) {
      case 'text':
        // skip empty text without provider metadata (same as response messages):
        if (part.text.length > 0 || part.providerMetadata != null) {
          parts.push({ type: 'text', content: part.text });
        }
        break;

      case 'reasoning':
        parts.push({ type: 'reasoning', content: part.text });
        break;

      case 'file':
      case 'reasoning-file':
        parts.push(
          convertFileDataToSemConv({
            data: part.file.base64,
            mediaType: part.file.mediaType,
          }),
        );
        break;

      case 'custom':
        parts.push({ type: 'custom', kind: part.kind });
        break;

      case 'tool-call':
        parts.push({
          type: 'tool_call',
          id: part.toolCallId,
          name: part.toolName,
          arguments: part.input,
        });
        break;

      case 'tool-result':
        parts.push({
          type: 'tool_call_response',
          id: part.toolCallId,
          response: part.output,
        });
        break;

      case 'tool-error':
        parts.push({
          type: 'tool_call_response',
          id: part.toolCallId,
          response: part.providerExecuted
            ? part.error
            : getErrorMessage(part.error),
        });
        break;

      case 'tool-approval-request':
        parts.push({
          type: 'tool_approval_request',
          approval_id: part.approvalId,
          tool_call_id: part.toolCall.toolCallId,
          reason: part.reason,
        });
        break;

      case 'tool-approval-response':
        parts.push({
          type: 'tool_approval_response',
          approval_id: part.approvalId,
          approved: part.approved,
          reason: part.reason,
        });
        break;

      case 'source':
        // sources are response metadata, not message parts:
        break;

      default: {
        const _exhaustive: never = part;
        parts.push({ type: String((_exhaustive as { type: string }).type) });
      }
    }
  }

  return [
    {
      role: 'assistant',
      parts,
      finish_reason: mapFinishReason(finishReason),
    },
  ];
}

/**
 * Converts step result data to the gen_ai.output.messages SemConv format.
 *
 * @deprecated Use `formatOutputContent` instead. This function groups parts
 * by type and does not preserve the order in which they were produced.
 */
export function formatOutputMessages({
  text,
  reasoning,
  toolCalls,
  toolResults,
  files,
  finishReason,
}: {
  text?: string;
  reasoning?: ReadonlyArray<{ text?: string }>;
  toolCalls?: ReadonlyArray<{
    toolCallId: string;
    toolName: string;
    input: unknown;
  }>;
  toolResults?: ReadonlyArray<{
    toolCallId: string;
    output: unknown;
  }>;
  files?: ReadonlyArray<{ mediaType: string; base64: string }>;
  finishReason: string;
}): SemConvOutputMessage[] {
  const parts: SemConvPart[] = [];

  if (reasoning) {
    for (const r of reasoning) {
      if ('text' in r && r.text) {
        parts.push({ type: 'reasoning', content: r.text });
      }
    }
  }

  if (text != null && text.length > 0) {
    parts.push({ type: 'text', content: text });
  }

  if (toolCalls) {
    for (const tc of toolCalls) {
      parts.push({
        type: 'tool_call',
        id: tc.toolCallId,
        name: tc.toolName,
        arguments: tc.input,
      });
    }
  }

  if (toolResults) {
    for (const toolResult of toolResults) {
      parts.push({
        type: 'tool_call_response',
        id: toolResult.toolCallId,
        response: toolResult.output,
      });
    }
  }

  if (files) {
    for (const file of files) {
      parts.push({
        type: 'blob',
        modality: getModality(file.mediaType),
        mime_type: file.mediaType,
        content: file.base64,
      });
    }
  }

  return [
    {
      role: 'assistant',
      parts,
      finish_reason: mapFinishReason(finishReason),
    },
  ];
}

/**
 * Converts generateObject result to the gen_ai.output.messages SemConv format.
 */
export function formatObjectOutputMessages({
  objectText,
  finishReason,
}: {
  objectText: string;
  finishReason: string;
}): SemConvOutputMessage[] {
  return [
    {
      role: 'assistant',
      parts: [{ type: 'text', content: objectText }],
      finish_reason: mapFinishReason(finishReason),
    },
  ];
}

function mapFinishReason(reason: string): string {
  const mapping: Record<string, string> = {
    stop: 'stop',
    length: 'length',
    'content-filter': 'content_filter',
    'tool-calls': 'tool_call',
    error: 'error',
    other: 'stop',
    unknown: 'stop',
  };
  return mapping[reason] ?? reason;
}
