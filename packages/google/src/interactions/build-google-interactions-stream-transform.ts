import type {
  JSONValue,
  LanguageModelV4FinishReason,
  LanguageModelV4Source,
  LanguageModelV4StreamPart,
  SharedV4ProviderMetadata,
  SharedV4Warning,
} from '@ai-sdk/provider';
import type { ParseResult } from '@ai-sdk/provider-utils';
import type {
  GoogleInteractionsEvent,
  GoogleInteractionsUsage,
} from './google-interactions-api';
import { convertGoogleInteractionsUsage } from './convert-google-interactions-usage';
import {
  annotationsToSources,
  builtinToolResultToSources,
} from './extract-google-interactions-sources';
import { mapGoogleInteractionsFinishReason } from './map-google-interactions-finish-reason';
import type {
  GoogleInteractionsAnnotation,
  GoogleInteractionsBuiltinToolResultContent,
  GoogleInteractionsStatus,
} from './google-interactions-prompt';

const BUILTIN_TOOL_CALL_TYPES = new Set([
  'google_search_call',
  'code_execution_call',
  'url_context_call',
  'file_search_call',
  'google_maps_call',
  'mcp_server_tool_call',
]);

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

type OpenBlockState =
  | { kind: 'text'; id: string; emittedSourceKeys: Set<string> }
  | {
      kind: 'reasoning';
      id: string;
      signature?: string;
    }
  | {
      kind: 'image';
      id: string;
      data?: string;
      mimeType?: string;
      uri?: string;
    }
  | {
      kind: 'function_call';
      id: string;
      toolCallId: string;
      toolName: string | undefined;
      arguments: Record<string, unknown>;
      signature?: string;
      /**
       * Whether `tool-input-start` has been emitted. Deferred until we know
       * the tool name -- `content.start` for a function_call only carries
       * `type: 'function_call'`; `id`, `name`, and `arguments` arrive on
       * `content.delta`.
       */
      startEmitted: boolean;
    }
  | {
      kind: 'builtin_tool_call';
      id: string;
      blockType: string;
      toolCallId: string;
      toolName: string;
      arguments: Record<string, unknown>;
      callEmitted: boolean;
    }
  | {
      kind: 'builtin_tool_result';
      id: string;
      blockType: string;
      callId: string;
      toolName: string;
      result: unknown;
      isError?: boolean;
      resultEmitted: boolean;
    }
  | { kind: 'unknown'; id: string };

/**
 * Builds a `TransformStream<ParseResult<GoogleInteractionsEvent>, LanguageModelV4StreamPart>`
 * over the seven Interactions SSE event types.
 *
 * Surfaces text + thought (reasoning), function_call, image, built-in tool
 * call/result blocks, and `text_annotation` -> `source` parts.
 */
export function buildGoogleInteractionsStreamTransform({
  warnings,
  generateId,
  includeRawChunks,
  serviceTier: headerServiceTier,
}: {
  warnings: Array<SharedV4Warning>;
  generateId: () => string;
  includeRawChunks?: boolean;
  /**
   * Defensive fallback for service tier read from the `x-gemini-service-tier`
   * HTTP response header. The Interactions API surfaces the applied tier in
   * the `interaction.complete` event body (see `service_tier` below); this
   * parameter exists so we still surface a tier if the API later starts
   * sending the header (matching `google-language-model.ts` commit
   * 1adfb76d2d).
   */
  serviceTier?: string;
}): TransformStream<
  ParseResult<GoogleInteractionsEvent>,
  LanguageModelV4StreamPart
> {
  let interactionId: string | undefined;
  let usage: GoogleInteractionsUsage | undefined;
  let serviceTier: string | undefined = headerServiceTier;
  let finishStatus: GoogleInteractionsStatus | string | undefined;
  let hasFunctionCall = false;

  /*
   * Per-index open content slots. The Interactions API frames concurrent
   * content blocks (e.g. text alongside thought) by `index`; we track each
   * open slot independently so a text delta at index N never collides with a
   * thought delta at index M.
   */
  const openBlocks = new Map<number, OpenBlockState>();

  /*
   * De-duplicate sources across the whole stream. Citations often re-appear
   * across multiple `text_annotation` deltas as the model's text grows;
   * surface each unique URL once.
   */
  const emittedSourceKeys = new Set<string>();

  function sourceKey(source: LanguageModelV4Source): string {
    return source.sourceType === 'url'
      ? `url:${source.url}`
      : `doc:${source.filename ?? source.title}`;
  }

  return new TransformStream<
    ParseResult<GoogleInteractionsEvent>,
    LanguageModelV4StreamPart
  >({
    start(controller) {
      controller.enqueue({ type: 'stream-start', warnings });
    },

    transform(chunk, controller) {
      if (includeRawChunks) {
        controller.enqueue({ type: 'raw', rawValue: chunk.rawValue });
      }

      if (!chunk.success) {
        finishStatus = 'failed';
        controller.enqueue({ type: 'error', error: chunk.error });
        return;
      }

      const value = chunk.value;
      const eventType = (value as { event_type?: string }).event_type;

      switch (eventType) {
        case 'interaction.start': {
          const event = value as Extract<
            GoogleInteractionsEvent,
            { event_type: 'interaction.start' }
          >;
          const interaction = event.interaction;
          /*
           * The Interactions API returns `id: ""` (empty string) on streaming
           * `interaction.start` / `interaction.complete` events when running
           * with `store: false` — there is no server-side record. Treat empty
           * string the same as missing so providerMetadata stays clean.
           */
          interactionId =
            interaction?.id != null && interaction.id.length > 0
              ? interaction.id
              : undefined;

          const created = (interaction as { created?: string } | undefined)
            ?.created;
          let timestamp: Date | undefined;
          if (typeof created === 'string') {
            const parsed = new Date(created);
            if (!Number.isNaN(parsed.getTime())) {
              timestamp = parsed;
            }
          }

          controller.enqueue({
            type: 'response-metadata',
            ...(interactionId != null ? { id: interactionId } : {}),
            modelId: (interaction as { model?: string } | undefined)?.model,
            ...(timestamp ? { timestamp } : {}),
          });
          break;
        }

        case 'content.start': {
          const event = value as Extract<
            GoogleInteractionsEvent,
            { event_type: 'content.start' }
          >;
          const block = event.content as
            | {
                type?: string;
                id?: string;
                call_id?: string;
                name?: string;
                arguments?: Record<string, unknown>;
                signature?: string;
                result?: unknown;
                is_error?: boolean;
                annotations?: Array<GoogleInteractionsAnnotation>;
              }
            | undefined;
          const index = event.index;
          const blockId = `${interactionId ?? 'interaction'}:${index}`;

          if (block?.type === 'text') {
            openBlocks.set(index, {
              kind: 'text',
              id: blockId,
              emittedSourceKeys: new Set<string>(),
            });
            controller.enqueue({ type: 'text-start', id: blockId });

            // text content blocks may already carry annotations on open.
            const initialSources = annotationsToSources({
              annotations: block.annotations,
              generateId,
            });
            for (const source of initialSources) {
              const key = sourceKey(source);
              if (emittedSourceKeys.has(key)) continue;
              emittedSourceKeys.add(key);
              controller.enqueue(source);
            }
          } else if (block?.type === 'image') {
            const img = block as {
              data?: string;
              mime_type?: string;
              uri?: string;
            };
            openBlocks.set(index, {
              kind: 'image',
              id: blockId,
              ...(img.data != null ? { data: img.data } : {}),
              ...(img.mime_type != null ? { mimeType: img.mime_type } : {}),
              ...(img.uri != null ? { uri: img.uri } : {}),
            });
          } else if (block?.type === 'thought') {
            const signature = (block as { signature?: string }).signature;
            openBlocks.set(index, {
              kind: 'reasoning',
              id: blockId,
              ...(signature != null ? { signature } : {}),
            });
            controller.enqueue({ type: 'reasoning-start', id: blockId });
          } else if (block?.type === 'function_call') {
            const fc = block;
            const toolCallId = fc.id ?? blockId;
            hasFunctionCall = true;
            const state: Extract<OpenBlockState, { kind: 'function_call' }> = {
              kind: 'function_call',
              id: blockId,
              toolCallId,
              toolName: fc.name,
              arguments: fc.arguments ?? {},
              ...(fc.signature != null ? { signature: fc.signature } : {}),
              startEmitted: false,
            };
            openBlocks.set(index, state);
            if (state.toolName != null) {
              controller.enqueue({
                type: 'tool-input-start',
                id: toolCallId,
                toolName: state.toolName,
              });
              state.startEmitted = true;
            }
          } else if (
            block?.type != null &&
            BUILTIN_TOOL_CALL_TYPES.has(block.type)
          ) {
            const toolName =
              block.type === 'mcp_server_tool_call'
                ? (block.name ?? 'mcp_server_tool')
                : builtinToolNameFromCallType(block.type);
            const toolCallId = block.id ?? blockId;
            const state: Extract<
              OpenBlockState,
              { kind: 'builtin_tool_call' }
            > = {
              kind: 'builtin_tool_call',
              id: blockId,
              blockType: block.type,
              toolCallId,
              toolName,
              arguments: block.arguments ?? {},
              callEmitted: false,
            };
            openBlocks.set(index, state);
          } else if (
            block?.type != null &&
            BUILTIN_TOOL_RESULT_TYPES.has(block.type)
          ) {
            const toolName =
              block.type === 'mcp_server_tool_result'
                ? (block.name ?? 'mcp_server_tool')
                : builtinToolNameFromResultType(block.type);
            const callId = block.call_id ?? blockId;
            const state: Extract<
              OpenBlockState,
              { kind: 'builtin_tool_result' }
            > = {
              kind: 'builtin_tool_result',
              id: blockId,
              blockType: block.type,
              callId,
              toolName,
              result: block.result ?? null,
              ...(block.is_error != null ? { isError: block.is_error } : {}),
              resultEmitted: false,
            };
            openBlocks.set(index, state);
          } else {
            openBlocks.set(index, { kind: 'unknown', id: blockId });
          }
          break;
        }

        case 'content.delta': {
          const event = value as Extract<
            GoogleInteractionsEvent,
            { event_type: 'content.delta' }
          >;
          const open = openBlocks.get(event.index);
          if (open == null) break;

          const delta = event.delta as
            | {
                type?: string;
                text?: string;
                signature?: string;
                content?: { type?: string; text?: string };
                id?: string;
                name?: string;
                arguments?: Record<string, unknown>;
                annotations?: Array<GoogleInteractionsAnnotation>;
                call_id?: string;
                result?: unknown;
                is_error?: boolean;
                data?: string;
                mime_type?: string;
                uri?: string;
              }
            | undefined;

          if (open.kind === 'text' && delta?.type === 'text') {
            const text = delta.text ?? '';
            if (text.length > 0) {
              controller.enqueue({
                type: 'text-delta',
                id: open.id,
                delta: text,
              });
            }
          } else if (
            open.kind === 'text' &&
            delta?.type === 'text_annotation'
          ) {
            const sources = annotationsToSources({
              annotations: delta.annotations,
              generateId,
            });
            for (const source of sources) {
              const key = sourceKey(source);
              if (emittedSourceKeys.has(key)) continue;
              emittedSourceKeys.add(key);
              open.emittedSourceKeys.add(key);
              controller.enqueue(source);
            }
          } else if (open.kind === 'image' && delta?.type === 'image') {
            /*
             * `image` ContentDelta carries the entire image payload as a
             * complete object (`data` base64 + `mime_type`, or `uri`) per
             * `googleapis/js-genai`
             * `src/interactions/resources/interactions.ts`
             * `ContentDelta.Image`. Accumulate the latest snapshot; emit the
             * file stream part on `content.stop`.
             */
            if (delta.data != null) open.data = delta.data;
            if (delta.mime_type != null) open.mimeType = delta.mime_type;
            if (delta.uri != null) open.uri = delta.uri;
          } else if (open.kind === 'reasoning') {
            if (delta?.type === 'thought_summary') {
              const item = delta.content;
              if (item?.type === 'text' && typeof item.text === 'string') {
                controller.enqueue({
                  type: 'reasoning-delta',
                  id: open.id,
                  delta: item.text,
                });
              }
            } else if (delta?.type === 'thought_signature') {
              const signature = delta.signature;
              if (signature != null) {
                open.signature = signature;
              }
            }
          } else if (
            open.kind === 'function_call' &&
            delta?.type === 'function_call'
          ) {
            /*
             * `function_call` ContentDelta carries the entire call as a
             * complete object (id, name, arguments) per
             * `googleapis/js-genai` `src/interactions/resources/interactions.ts`
             * `ContentDelta.FunctionCall` (line ~458) -- there is no token
             * streaming of the JSON arguments. We accumulate the latest
             * snapshot and emit a single `tool-input-delta` carrying the
             * stringified args at content.stop.
             *
             * The `name` typically arrives here (not on `content.start`), so
             * defer `tool-input-start` emission until we observe it.
             */
            if (delta.id != null) {
              open.toolCallId = delta.id;
            }
            if (delta.name != null) {
              open.toolName = delta.name;
            }
            if (delta.arguments != null) {
              open.arguments = delta.arguments;
            }
            if (delta.signature != null) {
              open.signature = delta.signature;
            }
            if (!open.startEmitted && open.toolName != null) {
              controller.enqueue({
                type: 'tool-input-start',
                id: open.toolCallId,
                toolName: open.toolName,
              });
              open.startEmitted = true;
            }
            hasFunctionCall = true;
          } else if (
            open.kind === 'builtin_tool_call' &&
            delta?.type === open.blockType
          ) {
            if (delta.id != null) open.toolCallId = delta.id;
            if (delta.arguments != null) open.arguments = delta.arguments;
            if (
              delta.name != null &&
              open.blockType === 'mcp_server_tool_call'
            ) {
              open.toolName = delta.name;
            }
          } else if (
            open.kind === 'builtin_tool_result' &&
            delta?.type === open.blockType
          ) {
            if (delta.call_id != null) open.callId = delta.call_id;
            if (delta.result !== undefined) open.result = delta.result;
            if (delta.is_error != null) open.isError = delta.is_error;
            if (
              delta.name != null &&
              open.blockType === 'mcp_server_tool_result'
            ) {
              open.toolName = delta.name;
            }
          }
          break;
        }

        case 'content.stop': {
          const event = value as Extract<
            GoogleInteractionsEvent,
            { event_type: 'content.stop' }
          >;
          const open = openBlocks.get(event.index);
          if (open == null) break;

          if (open.kind === 'text') {
            const textProviderMetadata =
              interactionId != null ? { google: { interactionId } } : undefined;
            controller.enqueue({
              type: 'text-end',
              id: open.id,
              ...(textProviderMetadata
                ? { providerMetadata: textProviderMetadata }
                : {}),
            });
          } else if (open.kind === 'reasoning') {
            const google: Record<string, string> = {};
            if (open.signature != null) google.signature = open.signature;
            if (interactionId != null) google.interactionId = interactionId;
            const providerMetadata =
              Object.keys(google).length > 0 ? { google } : undefined;
            controller.enqueue({
              type: 'reasoning-end',
              id: open.id,
              ...(providerMetadata ? { providerMetadata } : {}),
            });
          } else if (open.kind === 'image') {
            const google: Record<string, string> = {};
            if (interactionId != null) google.interactionId = interactionId;
            const providerMetadata =
              Object.keys(google).length > 0 ? { google } : undefined;
            if (open.data != null && open.data.length > 0) {
              controller.enqueue({
                type: 'file',
                mediaType: open.mimeType ?? 'image/png',
                data: { type: 'data', data: open.data },
                ...(providerMetadata ? { providerMetadata } : {}),
              });
            } else if (open.uri != null && open.uri.length > 0) {
              controller.enqueue({
                type: 'file',
                mediaType: open.mimeType ?? 'image/png',
                data: { type: 'url', url: new URL(open.uri) },
                ...(providerMetadata ? { providerMetadata } : {}),
              });
            }
          } else if (open.kind === 'function_call') {
            const toolName = open.toolName ?? 'unknown';
            const argsJson = JSON.stringify(open.arguments ?? {});
            if (!open.startEmitted) {
              controller.enqueue({
                type: 'tool-input-start',
                id: open.toolCallId,
                toolName,
              });
            }
            controller.enqueue({
              type: 'tool-input-delta',
              id: open.toolCallId,
              delta: argsJson,
            });
            controller.enqueue({
              type: 'tool-input-end',
              id: open.toolCallId,
            });
            const google: Record<string, string> = {};
            if (open.signature != null) google.signature = open.signature;
            if (interactionId != null) google.interactionId = interactionId;
            const providerMetadata =
              Object.keys(google).length > 0 ? { google } : undefined;
            controller.enqueue({
              type: 'tool-call',
              toolCallId: open.toolCallId,
              toolName,
              input: argsJson,
              ...(providerMetadata ? { providerMetadata } : {}),
            });
          } else if (open.kind === 'builtin_tool_call' && !open.callEmitted) {
            controller.enqueue({
              type: 'tool-call',
              toolCallId: open.toolCallId,
              toolName: open.toolName,
              input: JSON.stringify(open.arguments ?? {}),
              providerExecuted: true,
            });
            open.callEmitted = true;
          } else if (
            open.kind === 'builtin_tool_result' &&
            !open.resultEmitted
          ) {
            controller.enqueue({
              type: 'tool-result',
              toolCallId: open.callId,
              toolName: open.toolName,
              result: (open.result ?? null) as NonNullable<JSONValue>,
            });
            open.resultEmitted = true;

            const sources = builtinToolResultToSources({
              block: {
                type: open.blockType,
                call_id: open.callId,
                result: open.result,
              } as unknown as GoogleInteractionsBuiltinToolResultContent,
              generateId,
            });
            for (const source of sources) {
              const key = sourceKey(source);
              if (emittedSourceKeys.has(key)) continue;
              emittedSourceKeys.add(key);
              controller.enqueue(source);
            }
          }
          openBlocks.delete(event.index);
          break;
        }

        case 'interaction.status_update': {
          const event = value as Extract<
            GoogleInteractionsEvent,
            { event_type: 'interaction.status_update' }
          >;
          finishStatus = event.status;
          break;
        }

        case 'interaction.complete': {
          const event = value as Extract<
            GoogleInteractionsEvent,
            { event_type: 'interaction.complete' }
          >;
          const interaction = event.interaction as {
            id?: string;
            status?: GoogleInteractionsStatus;
            usage?: GoogleInteractionsUsage;
            service_tier?: string;
          };
          if (interaction?.id != null && interaction.id.length > 0) {
            interactionId = interaction.id;
          }
          if (interaction?.status != null) {
            finishStatus = interaction.status;
          }
          if (interaction?.usage != null) {
            usage = interaction.usage;
          }
          /*
           * The Interactions API surfaces the applied service tier on
           * `interaction.complete.interaction.service_tier` (NOT on the
           * `x-gemini-service-tier` HTTP header that `:generateContent`
           * uses). Body wins over header fallback.
           */
          if (interaction?.service_tier != null) {
            serviceTier = interaction.service_tier;
          }
          break;
        }

        case 'error': {
          const event = value as Extract<
            GoogleInteractionsEvent,
            { event_type: 'error' }
          >;
          finishStatus = 'failed';
          const errorPayload = event.error ?? {
            message: 'Unknown interaction error',
          };
          controller.enqueue({ type: 'error', error: errorPayload });
          break;
        }

        default:
          break;
      }
    },

    flush(controller) {
      const finishReason: LanguageModelV4FinishReason = {
        unified: mapGoogleInteractionsFinishReason({
          status: finishStatus,
          hasFunctionCall,
        }),
        raw: finishStatus,
      };

      const providerMetadata: SharedV4ProviderMetadata = {
        google: {
          ...(interactionId != null ? { interactionId } : {}),
          ...(serviceTier != null ? { serviceTier } : {}),
        },
      };

      controller.enqueue({
        type: 'finish',
        finishReason,
        usage: convertGoogleInteractionsUsage(usage),
        providerMetadata,
      });
    },
  });
}
