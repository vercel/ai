import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

/*
 * Zod schemas for the Gemini Interactions API wire format.
 *
 * Helpers are defined as factories (invoked only inside the exported
 * `lazySchema(() => ...)` callbacks) so no `z.object(...)` / `z.union(...)`
 * runs at module import. Schemas are intentionally narrow on the fields the
 * SDK consumes (text + thought) and lenient (`loose()` / `unknown`) on the
 * rest, so subsequent additions can widen without breaking the basic path.
 */

const tokenByModalitySchema = () =>
  z
    .object({
      modality: z.string().nullish(),
      tokens: z.number().nullish(),
    })
    .loose();

const usageSchema = () =>
  z
    .object({
      total_input_tokens: z.number().nullish(),
      total_output_tokens: z.number().nullish(),
      total_thought_tokens: z.number().nullish(),
      total_cached_tokens: z.number().nullish(),
      total_tool_use_tokens: z.number().nullish(),
      total_tokens: z.number().nullish(),
      input_tokens_by_modality: z.array(tokenByModalitySchema()).nullish(),
      output_tokens_by_modality: z.array(tokenByModalitySchema()).nullish(),
      cached_tokens_by_modality: z.array(tokenByModalitySchema()).nullish(),
      tool_use_tokens_by_modality: z.array(tokenByModalitySchema()).nullish(),
      grounding_tool_count: z
        .array(
          z
            .object({
              type: z.string().nullish(),
              count: z.number().nullish(),
            })
            .loose(),
        )
        .nullish(),
    })
    .loose();

export type GoogleInteractionsUsage = z.infer<ReturnType<typeof usageSchema>>;

const interactionStatusSchema = () =>
  z.enum([
    'in_progress',
    'requires_action',
    'completed',
    'failed',
    'cancelled',
    'incomplete',
  ]);

const annotationSchema = () => {
  const urlCitation = z
    .object({
      type: z.literal('url_citation'),
      url: z.string().nullish(),
      title: z.string().nullish(),
      start_index: z.number().nullish(),
      end_index: z.number().nullish(),
    })
    .loose();

  const fileCitation = z
    .object({
      type: z.literal('file_citation'),
      file_name: z.string().nullish(),
      document_uri: z.string().nullish(),
      source: z.string().nullish(),
      page_number: z.number().nullish(),
      media_id: z.string().nullish(),
      start_index: z.number().nullish(),
      end_index: z.number().nullish(),
      custom_metadata: z.record(z.string(), z.unknown()).nullish(),
    })
    .loose();

  const placeCitation = z
    .object({
      type: z.literal('place_citation'),
      name: z.string().nullish(),
      url: z.string().nullish(),
      place_id: z.string().nullish(),
      start_index: z.number().nullish(),
      end_index: z.number().nullish(),
    })
    .loose();

  return z.union([
    urlCitation,
    fileCitation,
    placeCitation,
    z.object({ type: z.string() }).loose(),
  ]);
};

const thoughtSummaryItemSchema = () =>
  z
    .object({
      type: z.string(),
      text: z.string().nullish(),
      data: z.string().nullish(),
      mime_type: z.string().nullish(),
    })
    .loose();

/*
 * Catch-all content block schema. Specific variants (`text`, `thought`,
 * `function_call`, built-in tool call/result) are narrowly typed; unknown
 * block types fall through `loose()`.
 */
const contentBlockSchema = () => {
  const textContent = z
    .object({
      type: z.literal('text'),
      text: z.string(),
      annotations: z.array(annotationSchema()).nullish(),
    })
    .loose();

  const thoughtContent = z
    .object({
      type: z.literal('thought'),
      signature: z.string().nullish(),
      summary: z.array(thoughtSummaryItemSchema()).nullish(),
    })
    .loose();

  const functionCallContent = z
    .object({
      type: z.literal('function_call'),
      id: z.string(),
      name: z.string(),
      arguments: z.record(z.string(), z.unknown()).nullish(),
      signature: z.string().nullish(),
    })
    .loose();

  const imageContent = z
    .object({
      type: z.literal('image'),
      data: z.string().nullish(),
      mime_type: z.string().nullish(),
      resolution: z.enum(['low', 'medium', 'high', 'ultra_high']).nullish(),
      uri: z.string().nullish(),
    })
    .loose();

  const builtinToolCall = z
    .object({
      type: z.enum([
        'google_search_call',
        'code_execution_call',
        'url_context_call',
        'file_search_call',
        'google_maps_call',
        'mcp_server_tool_call',
      ]),
      id: z.string(),
      arguments: z.record(z.string(), z.unknown()).nullish(),
      name: z.string().nullish(),
      server_name: z.string().nullish(),
      search_type: z.string().nullish(),
      signature: z.string().nullish(),
    })
    .loose();

  const builtinToolResult = z
    .object({
      type: z.enum([
        'google_search_result',
        'code_execution_result',
        'url_context_result',
        'file_search_result',
        'google_maps_result',
        'mcp_server_tool_result',
      ]),
      call_id: z.string(),
      result: z.unknown().nullish(),
      is_error: z.boolean().nullish(),
      name: z.string().nullish(),
      server_name: z.string().nullish(),
      signature: z.string().nullish(),
    })
    .loose();

  return z.union([
    textContent,
    imageContent,
    thoughtContent,
    functionCallContent,
    builtinToolCall,
    builtinToolResult,
    z.object({ type: z.string() }).loose(),
  ]);
};

export type GoogleInteractionsContentBlock = z.infer<
  ReturnType<typeof contentBlockSchema>
>;

export const googleInteractionsResponseSchema = lazySchema(() =>
  zodSchema(
    z
      .object({
        /*
         * `id` is omitted from the response body when `store: false` (fully
         * stateless mode) — there is no server-side interaction record for the
         * client to reference. `nullish` lets the schema accept that shape.
         */
        id: z.string().nullish(),
        created: z.string().nullish(),
        updated: z.string().nullish(),
        status: interactionStatusSchema(),
        model: z.string().nullish(),
        agent: z.string().nullish(),
        outputs: z.array(contentBlockSchema()).nullish(),
        usage: usageSchema().nullish(),
        service_tier: z.string().nullish(),
        previous_interaction_id: z.string().nullish(),
        response_modalities: z.array(z.string()).nullish(),
      })
      .loose(),
  ),
);

export type GoogleInteractionsResponse = InferSchema<
  typeof googleInteractionsResponseSchema
>;

export const googleInteractionsEventSchema = lazySchema(() =>
  zodSchema(
    (() => {
      const status = interactionStatusSchema();
      const annotation = annotationSchema();
      const thoughtSummaryItem = thoughtSummaryItemSchema();

      const interactionStartEvent = z
        .object({
          event_type: z.literal('interaction.start'),
          event_id: z.string().nullish(),
          interaction: z
            .object({
              /*
               * `id` is omitted when `store: false` (fully stateless mode);
               * see the matching note on `googleInteractionsResponseSchema.id`.
               */
              id: z.string().nullish(),
              created: z.string().nullish(),
              model: z.string().nullish(),
              agent: z.string().nullish(),
              status: status.nullish(),
            })
            .loose(),
        })
        .loose();

      const contentStartEvent = z
        .object({
          event_type: z.literal('content.start'),
          event_id: z.string().nullish(),
          index: z.number(),
          content: contentBlockSchema(),
        })
        .loose();

      const contentDeltaText = z
        .object({
          type: z.literal('text'),
          text: z.string(),
        })
        .loose();

      const contentDeltaThoughtSummary = z
        .object({
          type: z.literal('thought_summary'),
          content: thoughtSummaryItem.nullish(),
        })
        .loose();

      const contentDeltaThoughtSignature = z
        .object({
          type: z.literal('thought_signature'),
          signature: z.string().nullish(),
        })
        .loose();

      /*
       * `function_call` content deltas carry the entire call (id + name +
       * arguments) — there is no per-token argument streaming. See js-genai
       * `src/interactions/resources/interactions.ts` `ContentDelta.FunctionCall`.
       */
      const contentDeltaFunctionCall = z
        .object({
          type: z.literal('function_call'),
          id: z.string(),
          name: z.string(),
          arguments: z.record(z.string(), z.unknown()).nullish(),
          signature: z.string().nullish(),
        })
        .loose();

      const contentDeltaTextAnnotation = z
        .object({
          type: z.literal('text_annotation'),
          annotations: z.array(annotation).nullish(),
        })
        .loose();

      /*
       * `image` content deltas carry the entire image payload (`data` base64 +
       * `mime_type`, or `uri`) — there is no per-byte streaming. See js-genai
       * `src/interactions/resources/interactions.ts` `ContentDelta.Image`.
       */
      const contentDeltaImage = z
        .object({
          type: z.literal('image'),
          data: z.string().nullish(),
          mime_type: z.string().nullish(),
          resolution: z.enum(['low', 'medium', 'high', 'ultra_high']).nullish(),
          uri: z.string().nullish(),
        })
        .loose();

      /*
       * Built-in tool call deltas mirror the same shape as their content-block
       * counterparts (full payload per delta -- there is no per-token streaming
       * of arguments). Result deltas carry the populated `result` payload.
       */
      const contentDeltaBuiltinToolCall = z
        .object({
          type: z.enum([
            'google_search_call',
            'code_execution_call',
            'url_context_call',
            'file_search_call',
            'google_maps_call',
            'mcp_server_tool_call',
          ]),
          id: z.string(),
          arguments: z.record(z.string(), z.unknown()).nullish(),
          name: z.string().nullish(),
          server_name: z.string().nullish(),
          search_type: z.string().nullish(),
          signature: z.string().nullish(),
        })
        .loose();

      const contentDeltaBuiltinToolResult = z
        .object({
          type: z.enum([
            'google_search_result',
            'code_execution_result',
            'url_context_result',
            'file_search_result',
            'google_maps_result',
            'mcp_server_tool_result',
          ]),
          call_id: z.string(),
          result: z.unknown().nullish(),
          is_error: z.boolean().nullish(),
          name: z.string().nullish(),
          server_name: z.string().nullish(),
          signature: z.string().nullish(),
        })
        .loose();

      const contentDeltaUnknown = z.object({ type: z.string() }).loose();

      const contentDeltaUnion = z.union([
        contentDeltaText,
        contentDeltaImage,
        contentDeltaThoughtSummary,
        contentDeltaThoughtSignature,
        contentDeltaFunctionCall,
        contentDeltaTextAnnotation,
        contentDeltaBuiltinToolCall,
        contentDeltaBuiltinToolResult,
        contentDeltaUnknown,
      ]);

      const contentDeltaEvent = z
        .object({
          event_type: z.literal('content.delta'),
          event_id: z.string().nullish(),
          index: z.number(),
          delta: contentDeltaUnion,
        })
        .loose();

      const contentStopEvent = z
        .object({
          event_type: z.literal('content.stop'),
          event_id: z.string().nullish(),
          index: z.number(),
        })
        .loose();

      const interactionStatusUpdateEvent = z
        .object({
          event_type: z.literal('interaction.status_update'),
          event_id: z.string().nullish(),
          interaction_id: z.string().nullish(),
          status,
        })
        .loose();

      const interactionCompleteEvent = z
        .object({
          event_type: z.literal('interaction.complete'),
          event_id: z.string().nullish(),
          interaction: z
            .object({
              id: z.string().nullish(),
              status: status.nullish(),
              usage: usageSchema().nullish(),
              service_tier: z.string().nullish(),
            })
            .loose(),
        })
        .loose();

      const errorEvent = z
        .object({
          event_type: z.literal('error'),
          event_id: z.string().nullish(),
          error: z
            .object({
              code: z.string().nullish(),
              message: z.string().nullish(),
            })
            .loose()
            .nullish(),
        })
        .loose();

      const unknownEvent = z.object({ event_type: z.string() }).loose();

      return z.union([
        interactionStartEvent,
        contentStartEvent,
        contentDeltaEvent,
        contentStopEvent,
        interactionStatusUpdateEvent,
        interactionCompleteEvent,
        errorEvent,
        unknownEvent,
      ]);
    })(),
  ),
);

export type GoogleInteractionsEvent = InferSchema<
  typeof googleInteractionsEventSchema
>;
