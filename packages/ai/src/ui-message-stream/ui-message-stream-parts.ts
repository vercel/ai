import { z } from 'zod';
import { ProviderMetadata } from '../../core';

export const uiMessageStreamPartSchema = z.union([
  z.object({
    type: z.literal('text'),
    value: z.string(),
  }),
  z.object({
    type: z.literal('error'),
    value: z.string(),
  }),
  z.object({
    type: z.literal('tool-call'),
    value: z.object({
      toolCallId: z.string(),
      toolName: z.string(),
      args: z.unknown(),
    }),
  }),
  z.object({
    type: z.literal('tool-result'),
    value: z.object({
      toolCallId: z.string(),
      result: z.unknown(),
      providerMetadata: z.any().optional(),
    }),
  }),
  z.object({
    type: z.literal('tool-call-streaming-start'),
    value: z.object({ toolCallId: z.string(), toolName: z.string() }),
  }),
  z.object({
    type: z.literal('tool-call-delta'),
    value: z.object({ toolCallId: z.string(), argsTextDelta: z.string() }),
  }),
  z.object({
    type: z.literal('reasoning'),
    value: z.object({
      text: z.string(),
      providerMetadata: z.record(z.any()).optional(),
    }),
  }),
  z.object({
    type: z.literal('source'),
    value: z.object({
      sourceType: z.literal('url'),
      id: z.string(),
      url: z.string(),
      title: z.string().optional(),
      providerMetadata: z.any().optional(), // Use z.any() for generic metadata
    }),
  }),
  z.object({
    type: z.literal('file'),
    value: z.object({
      url: z.string(),
      mediaType: z.string(),
    }),
  }),
  z.object({
    type: z.string().startsWith('data-'),
    value: z.object({ data: z.unknown() }),
  }),
  z.object({
    type: z.literal('metadata'),
    value: z.object({ metadata: z.unknown() }),
  }),
  z.object({
    type: z.literal('start-step'),
    value: z.object({ metadata: z.unknown() }).optional(),
  }),
  z.object({
    type: z.literal('finish-step'),
    value: z.object({ metadata: z.unknown() }).optional(),
  }),
  z.object({
    type: z.literal('start'),
    value: z
      .object({
        messageId: z.string().optional(),
        metadata: z.unknown(),
      })
      .optional(),
  }),
  z.object({
    type: z.literal('finish'),
    value: z.object({ metadata: z.unknown() }).optional(),
  }),
  z.object({
    type: z.literal('reasoning-part-finish'),
    value: z.null().optional(),
  }),
]);

export type UIMessageStreamPart =
  | {
      type: 'text';
      value: string;
    }
  | {
      type: 'error';
      value: string;
    }
  | {
      type: 'tool-call';
      value: {
        toolCallId: string;
        toolName: string;
        args: unknown;
      };
    }
  | {
      type: 'tool-result';
      value: {
        toolCallId: string;
        result: unknown;
        providerMetadata?: ProviderMetadata;
      };
    }
  | {
      type: 'tool-call-streaming-start';
      value: { toolCallId: string; toolName: string };
    }
  | {
      type: 'tool-call-delta';
      value: { toolCallId: string; argsTextDelta: string };
    }
  | {
      type: 'reasoning';
      value: {
        text: string;
        providerMetadata?: ProviderMetadata;
      };
    }
  | {
      // TODO evaluate flattening sources similar to data ui parts
      type: 'source';
      value: {
        sourceType: 'url';
        id: string;
        url: string;
        title?: string;
        providerMetadata?: ProviderMetadata;
      };
    }
  | {
      type: 'file';
      value: {
        url: string;
        mediaType: string;
      };
    }
  | {
      type: `data-${string}`;
      value: {
        id?: string;
        data: unknown;
      };
    }
  | {
      type: 'metadata';
      value: { metadata: unknown };
    }
  | {
      type: 'start-step';
      value?: { metadata: unknown };
    }
  | {
      type: 'finish-step';
      value?: { metadata: unknown };
    }
  | {
      type: 'start';
      value?: { messageId?: string; metadata?: unknown };
    }
  | {
      type: 'finish';
      value?: { metadata: unknown };
    }
  | {
      type: 'reasoning-part-finish';
      value?: null;
    };
