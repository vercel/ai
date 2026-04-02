import {
  LanguageModelV4Message,
  LanguageModelV4Prompt,
} from '@ai-sdk/provider';
import { convertDataContentToBase64String } from 'ai';

type SemConvPart =
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

interface SemConvInputMessage {
  role: string;
  parts: SemConvPart[];
}

interface SemConvOutputMessage {
  role: string;
  parts: SemConvPart[];
  finish_reason: string;
}

interface SemConvSystemInstruction {
  type: string;
  content?: string;
  [key: string]: unknown;
}

/**
 * Maps an AI SDK provider string (e.g. "anthropic.messages", "openai.chat")
 * to a well-known gen_ai.provider.name value per the OTel GenAI SemConv.
 */
export function mapProviderName(provider: string): string {
  const prefix = provider.split('.')[0].toLowerCase();

  const wellKnownProviders: Record<string, string> = {
    anthropic: 'anthropic',
    openai: 'openai',
    'azure-openai': 'azure.ai.openai',
    azure: 'azure.ai.inference',
    google: 'gcp.gen_ai',
    'google-vertex': 'gcp.vertex_ai',
    'google-generative-ai': 'gcp.gemini',
    mistral: 'mistral_ai',
    cohere: 'cohere',
    'amazon-bedrock': 'aws.bedrock',
    bedrock: 'aws.bedrock',
    groq: 'groq',
    deepseek: 'deepseek',
    perplexity: 'perplexity',
    xai: 'x_ai',
  };

  return wellKnownProviders[prefix] ?? provider;
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
    'ai.embed': 'embeddings',
    'ai.embedMany': 'embeddings',
    'ai.rerank': 'rerank',
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
  part: LanguageModelV4Message extends { content: infer C }
    ? C extends Array<infer P>
      ? P
      : never
    : never,
): SemConvPart {
  const p = part as Record<string, unknown>;
  switch (p.type) {
    case 'text':
      return { type: 'text', content: p.text as string };

    case 'reasoning':
      return { type: 'reasoning', content: p.text as string };

    case 'tool-call':
      return {
        type: 'tool_call',
        id: (p.toolCallId as string) ?? null,
        name: p.toolName as string,
        arguments: p.input,
      };

    case 'tool-result': {
      const output = p.output as { type: string; value?: unknown } | undefined;
      let response: unknown;
      if (output) {
        if (output.type === 'text' || output.type === 'error-text') {
          response = output.value;
        } else if (output.type === 'json' || output.type === 'error-json') {
          response = output.value;
        } else if (output.type === 'execution-denied') {
          response = { denied: true, reason: (output as any).reason };
        } else {
          response = output.value ?? output;
        }
      }
      return {
        type: 'tool_call_response',
        id: (p.toolCallId as string) ?? null,
        response,
      };
    }

    case 'file': {
      const data = p.data;
      let content: string;
      if (data instanceof Uint8Array) {
        content = convertDataContentToBase64String(data);
      } else if (typeof data === 'string') {
        if (
          typeof data === 'string' &&
          (data.startsWith('http://') || data.startsWith('https://'))
        ) {
          return {
            type: 'uri',
            modality: getModality(p.mediaType as string),
            mime_type: (p.mediaType as string) ?? null,
            uri: data,
          };
        }
        content = data;
      } else {
        content = String(data);
      }
      return {
        type: 'blob',
        modality: getModality(p.mediaType as string),
        mime_type: (p.mediaType as string) ?? null,
        content,
      };
    }

    case 'tool-approval-response':
      return {
        type: 'tool_approval_response',
        approval_id: p.approvalId,
        approved: p.approved,
        reason: p.reason,
      };

    case 'custom':
      return { type: 'custom', kind: p.kind };

    default:
      return { type: String(p.type) };
  }
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
 * System messages are excluded (they go into gen_ai.system_instructions).
 */
export function formatInputMessages(
  prompt: LanguageModelV4Prompt,
): SemConvInputMessage[] {
  return prompt
    .filter(msg => msg.role !== 'system')
    .map((message: LanguageModelV4Message) => {
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
 * Extracts the system instruction from a LanguageModelV4Prompt if present.
 */
export function extractSystemFromPrompt(
  prompt: LanguageModelV4Prompt,
): string | undefined {
  const systemMsg = prompt.find(msg => msg.role === 'system');
  if (systemMsg && systemMsg.role === 'system') {
    return systemMsg.content;
  }
  return undefined;
}

/**
 * Converts step result data to the gen_ai.output.messages SemConv format.
 */
export function formatOutputMessages({
  text,
  reasoning,
  toolCalls,
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
