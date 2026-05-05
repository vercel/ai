import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

/**
 * Zod schemas for the Gemini Interactions API wire format.
 *
 * Schemas are intentionally narrow on the fields TASK-1 reads (text + thought)
 * and lenient (`loose()` / `unknown`) on the rest, so subsequent tasks can
 * widen without breaking the basic-text path.
 */

const tokenByModalitySchema = z
  .object({
    modality: z.string().nullish(),
    tokens: z.number().nullish(),
  })
  .loose();

export const googleInteractionsUsageSchema = z
  .object({
    total_input_tokens: z.number().nullish(),
    total_output_tokens: z.number().nullish(),
    total_thought_tokens: z.number().nullish(),
    total_cached_tokens: z.number().nullish(),
    total_tool_use_tokens: z.number().nullish(),
    total_tokens: z.number().nullish(),
    input_tokens_by_modality: z.array(tokenByModalitySchema).nullish(),
    output_tokens_by_modality: z.array(tokenByModalitySchema).nullish(),
    cached_tokens_by_modality: z.array(tokenByModalitySchema).nullish(),
    tool_use_tokens_by_modality: z.array(tokenByModalitySchema).nullish(),
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

export type GoogleInteractionsUsage = InferSchema<
  typeof googleInteractionsUsageSchema
>;

const interactionStatusSchema = z.enum([
  'in_progress',
  'requires_action',
  'completed',
  'failed',
  'cancelled',
  'incomplete',
]);

const urlCitationSchema = z
  .object({
    type: z.literal('url_citation'),
    url: z.string().nullish(),
    title: z.string().nullish(),
    start_index: z.number().nullish(),
    end_index: z.number().nullish(),
  })
  .loose();

const fileCitationSchema = z
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

const placeCitationSchema = z
  .object({
    type: z.literal('place_citation'),
    name: z.string().nullish(),
    url: z.string().nullish(),
    place_id: z.string().nullish(),
    start_index: z.number().nullish(),
    end_index: z.number().nullish(),
  })
  .loose();

const annotationSchema = z.union([
  urlCitationSchema,
  fileCitationSchema,
  placeCitationSchema,
  z.object({ type: z.string() }).loose(),
]);

const textContentSchema = z
  .object({
    type: z.literal('text'),
    text: z.string(),
    annotations: z.array(annotationSchema).nullish(),
  })
  .loose();

const thoughtSummaryItemSchema = z
  .object({
    type: z.string(),
    text: z.string().nullish(),
    data: z.string().nullish(),
    mime_type: z.string().nullish(),
  })
  .loose();

const thoughtContentSchema = z
  .object({
    type: z.literal('thought'),
    signature: z.string().nullish(),
    summary: z.array(thoughtSummaryItemSchema).nullish(),
  })
  .loose();

const functionCallContentSchema = z
  .object({
    type: z.literal('function_call'),
    id: z.string(),
    name: z.string(),
    arguments: z.record(z.string(), z.unknown()).nullish(),
    signature: z.string().nullish(),
  })
  .loose();

const imageContentSchema = z
  .object({
    type: z.literal('image'),
    data: z.string().nullish(),
    mime_type: z.string().nullish(),
    resolution: z.enum(['low', 'medium', 'high', 'ultra_high']).nullish(),
    uri: z.string().nullish(),
  })
  .loose();

const builtinToolCallSchema = z
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

const builtinToolResultSchema = z
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

/**
 * Catch-all content block schema. Specific variants (`text`, `thought`,
 * `function_call`, built-in tool call/result) are narrowly typed; unknown
 * block types fall through `loose()`.
 */
const contentBlockSchema = z.union([
  textContentSchema,
  imageContentSchema,
  thoughtContentSchema,
  functionCallContentSchema,
  builtinToolCallSchema,
  builtinToolResultSchema,
  z.object({ type: z.string() }).loose(),
]);

export type GoogleInteractionsContentBlock = InferSchema<
  typeof contentBlockSchema
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
        status: interactionStatusSchema,
        model: z.string().nullish(),
        agent: z.string().nullish(),
        outputs: z.array(contentBlockSchema).nullish(),
        usage: googleInteractionsUsageSchema.nullish(),
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

const interactionStartEventSchema = z
  .object({
    event_type: z.literal('interaction.start'),
    event_id: z.string().nullish(),
    interaction: z
      .object({
        /*
         * `id` is omitted when `store: false` (fully stateless mode); see the
         * matching note on `googleInteractionsResponseSchema.id`.
         */
        id: z.string().nullish(),
        created: z.string().nullish(),
        model: z.string().nullish(),
        agent: z.string().nullish(),
        status: interactionStatusSchema.nullish(),
      })
      .loose(),
  })
  .loose();

const contentStartEventSchema = z
  .object({
    event_type: z.literal('content.start'),
    event_id: z.string().nullish(),
    index: z.number(),
    content: contentBlockSchema,
  })
  .loose();

const contentDeltaTextSchema = z
  .object({
    type: z.literal('text'),
    text: z.string(),
  })
  .loose();

const contentDeltaThoughtSummarySchema = z
  .object({
    type: z.literal('thought_summary'),
    content: thoughtSummaryItemSchema.nullish(),
  })
  .loose();

const contentDeltaThoughtSignatureSchema = z
  .object({
    type: z.literal('thought_signature'),
    signature: z.string().nullish(),
  })
  .loose();

/**
 * `function_call` content deltas carry the entire call (id + name +
 * arguments) — there is no per-token argument streaming. See js-genai
 * `src/interactions/resources/interactions.ts` `ContentDelta.FunctionCall`.
 */
const contentDeltaFunctionCallSchema = z
  .object({
    type: z.literal('function_call'),
    id: z.string(),
    name: z.string(),
    arguments: z.record(z.string(), z.unknown()).nullish(),
    signature: z.string().nullish(),
  })
  .loose();

const contentDeltaTextAnnotationSchema = z
  .object({
    type: z.literal('text_annotation'),
    annotations: z.array(annotationSchema).nullish(),
  })
  .loose();

/**
 * `image` content deltas carry the entire image payload (`data` base64 +
 * `mime_type`, or `uri`) — there is no per-byte streaming. See js-genai
 * `src/interactions/resources/interactions.ts` `ContentDelta.Image`.
 */
const contentDeltaImageSchema = z
  .object({
    type: z.literal('image'),
    data: z.string().nullish(),
    mime_type: z.string().nullish(),
    resolution: z.enum(['low', 'medium', 'high', 'ultra_high']).nullish(),
    uri: z.string().nullish(),
  })
  .loose();

/**
 * Built-in tool call deltas mirror the same shape as their content-block
 * counterparts (full payload per delta -- there is no per-token streaming of
 * arguments). Result deltas carry the populated `result` payload.
 */
const contentDeltaBuiltinToolCallSchema = z
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

const contentDeltaBuiltinToolResultSchema = z
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

const contentDeltaUnknownSchema = z.object({ type: z.string() }).loose();

const contentDeltaUnion = z.union([
  contentDeltaTextSchema,
  contentDeltaImageSchema,
  contentDeltaThoughtSummarySchema,
  contentDeltaThoughtSignatureSchema,
  contentDeltaFunctionCallSchema,
  contentDeltaTextAnnotationSchema,
  contentDeltaBuiltinToolCallSchema,
  contentDeltaBuiltinToolResultSchema,
  contentDeltaUnknownSchema,
]);

const contentDeltaEventSchema = z
  .object({
    event_type: z.literal('content.delta'),
    event_id: z.string().nullish(),
    index: z.number(),
    delta: contentDeltaUnion,
  })
  .loose();

const contentStopEventSchema = z
  .object({
    event_type: z.literal('content.stop'),
    event_id: z.string().nullish(),
    index: z.number(),
  })
  .loose();

const interactionStatusUpdateEventSchema = z
  .object({
    event_type: z.literal('interaction.status_update'),
    event_id: z.string().nullish(),
    interaction_id: z.string().nullish(),
    status: interactionStatusSchema,
  })
  .loose();

const interactionCompleteEventSchema = z
  .object({
    event_type: z.literal('interaction.complete'),
    event_id: z.string().nullish(),
    interaction: z
      .object({
        id: z.string().nullish(),
        status: interactionStatusSchema.nullish(),
        usage: googleInteractionsUsageSchema.nullish(),
        service_tier: z.string().nullish(),
      })
      .loose(),
  })
  .loose();

const errorEventSchema = z
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

const unknownEventSchema = z.object({ event_type: z.string() }).loose();

export const googleInteractionsEventSchema = lazySchema(() =>
  zodSchema(
    z.union([
      interactionStartEventSchema,
      contentStartEventSchema,
      contentDeltaEventSchema,
      contentStopEventSchema,
      interactionStatusUpdateEventSchema,
      interactionCompleteEventSchema,
      errorEventSchema,
      unknownEventSchema,
    ]),
  ),
);

export type GoogleInteractionsEvent = InferSchema<
  typeof googleInteractionsEventSchema
>;
