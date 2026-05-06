import type { JSONValue, LanguageModelV4Content } from '@ai-sdk/provider';
import type { GoogleInteractionsContentBlock } from './google-interactions-api';
import {
  annotationsToSources,
  builtinToolResultToSources,
} from './extract-google-interactions-sources';
import type {
  GoogleInteractionsAnnotation,
  GoogleInteractionsBuiltinToolResultContent,
} from './google-interactions-prompt';

export type ParseGoogleInteractionsOutputsResult = {
  content: Array<LanguageModelV4Content>;
  hasFunctionCall: boolean;
};

/*
 * Builds a `providerMetadata.google` payload for an output part so the
 * Interactions converter on the next turn can read both the per-block
 * `signature` (round-trip) and the parent `interactionId` (history compaction
 * under `previousInteractionId`).
 */
function googleProviderMetadata({
  signature,
  interactionId,
}: {
  signature?: string | null;
  interactionId?: string;
}): { providerMetadata: { google: Record<string, string> } } | object {
  const google: Record<string, string> = {};
  if (signature != null) {
    google.signature = signature;
  }
  if (interactionId != null) {
    google.interactionId = interactionId;
  }
  return Object.keys(google).length > 0 ? { providerMetadata: { google } } : {};
}

/**
 * Set of built-in tool *call* discriminators emitted by the Interactions API.
 */
const BUILTIN_TOOL_CALL_TYPES = new Set([
  'google_search_call',
  'code_execution_call',
  'url_context_call',
  'file_search_call',
  'google_maps_call',
  'mcp_server_tool_call',
]);

/**
 * Set of built-in tool *result* discriminators.
 */
const BUILTIN_TOOL_RESULT_TYPES = new Set([
  'google_search_result',
  'code_execution_result',
  'url_context_result',
  'file_search_result',
  'google_maps_result',
  'mcp_server_tool_result',
]);

function builtinToolNameFromCallType(type: string): string {
  return type.replace(/_call$/, '');
}

function builtinToolNameFromResultType(type: string): string {
  return type.replace(/_result$/, '');
}

/**
 * Walks the `outputs[]` array of an Interaction response and emits AI SDK
 * `LanguageModelV4Content[]`. Surfaces:
 *
 * - `text` blocks (with annotations -> source parts)
 * - `thought` blocks (reasoning)
 * - `function_call` blocks (client-executed tool calls)
 * - Built-in tool `*_call` / `*_result` blocks (Google Search, Code Execution,
 *   URL Context, File Search, Google Maps, MCP Server) as
 *   `tool-call`/`tool-result` parts with `providerExecuted: true`.
 * - `text_annotation`-derived sources from the URL / file / place citations
 *   carried on text blocks.
 */
export function parseGoogleInteractionsOutputs({
  outputs,
  generateId,
  interactionId,
}: {
  outputs: Array<GoogleInteractionsContentBlock> | null | undefined;
  generateId: () => string;
  /**
   * Top-level `Interaction.id` on the response. Stamped onto each output
   * part's `providerMetadata.google.interactionId` so the converter can drop
   * matching assistant turns when `previousInteractionId` is used on the
   * next turn (compaction).
   */
  interactionId?: string;
}): ParseGoogleInteractionsOutputsResult {
  const content: Array<LanguageModelV4Content> = [];
  let hasFunctionCall = false;

  if (outputs == null) {
    return { content, hasFunctionCall };
  }

  for (const block of outputs) {
    if (block == null || typeof block !== 'object') continue;
    const type = (block as { type?: string }).type;
    if (typeof type !== 'string') continue;

    switch (type) {
      case 'text': {
        const text = (block as { text?: string }).text ?? '';
        const annotations = (
          block as { annotations?: Array<GoogleInteractionsAnnotation> }
        ).annotations;
        content.push({
          type: 'text',
          text,
          ...googleProviderMetadata({ interactionId }),
        });
        const sources = annotationsToSources({ annotations, generateId });
        for (const source of sources) {
          content.push(source);
        }
        break;
      }
      case 'thought': {
        const thought = block as {
          signature?: string;
          summary?: Array<{ type: string; text?: string }>;
        };
        const summary = Array.isArray(thought.summary) ? thought.summary : [];
        const text = summary
          .filter(
            item => item?.type === 'text' && typeof item.text === 'string',
          )
          .map(item => item.text as string)
          .join('\n');
        content.push({
          type: 'reasoning',
          text,
          ...googleProviderMetadata({
            signature: thought.signature,
            interactionId,
          }),
        });
        break;
      }
      case 'image': {
        const image = block as {
          data?: string;
          mime_type?: string;
          uri?: string;
        };
        if (image.data != null && image.data.length > 0) {
          content.push({
            type: 'file',
            mediaType: image.mime_type ?? 'image/png',
            data: { type: 'data', data: image.data },
            ...googleProviderMetadata({ interactionId }),
          });
        } else if (image.uri != null && image.uri.length > 0) {
          content.push({
            type: 'file',
            mediaType: image.mime_type ?? 'image/png',
            data: { type: 'url', url: new URL(image.uri) },
            ...googleProviderMetadata({ interactionId }),
          });
        }
        break;
      }
      case 'function_call': {
        hasFunctionCall = true;
        const call = block as {
          id: string;
          name: string;
          arguments?: Record<string, unknown> | null;
          signature?: string | null;
        };
        content.push({
          type: 'tool-call',
          toolCallId: call.id,
          toolName: call.name,
          input: JSON.stringify(call.arguments ?? {}),
          ...googleProviderMetadata({
            signature: call.signature,
            interactionId,
          }),
        });
        break;
      }
      default: {
        if (BUILTIN_TOOL_CALL_TYPES.has(type)) {
          const call = block as {
            id?: string;
            arguments?: Record<string, unknown>;
            name?: string;
            server_name?: string;
          };
          const toolName =
            type === 'mcp_server_tool_call'
              ? (call.name ?? 'mcp_server_tool')
              : builtinToolNameFromCallType(type);
          const input = JSON.stringify(call.arguments ?? {});
          content.push({
            type: 'tool-call',
            toolCallId: call.id ?? generateId(),
            toolName,
            input,
            providerExecuted: true,
          });
        } else if (BUILTIN_TOOL_RESULT_TYPES.has(type)) {
          const result = block as {
            call_id?: string;
            result?: unknown;
            is_error?: boolean;
            name?: string;
          };
          const toolName =
            type === 'mcp_server_tool_result'
              ? (result.name ?? 'mcp_server_tool')
              : builtinToolNameFromResultType(type);
          content.push({
            type: 'tool-result',
            toolCallId: result.call_id ?? generateId(),
            toolName,
            result: (result.result ?? null) as NonNullable<JSONValue>,
          });
          const sources = builtinToolResultToSources({
            block:
              block as unknown as GoogleInteractionsBuiltinToolResultContent,
            generateId,
          });
          for (const source of sources) {
            content.push(source);
          }
        }
        break;
      }
    }
  }

  return { content, hasFunctionCall };
}
