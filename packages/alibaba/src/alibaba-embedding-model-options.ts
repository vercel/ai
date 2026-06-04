import { z } from 'zod/v4';

export type AlibabaEmbeddingModelId =
  | 'text-embedding-v4'
  | 'text-embedding-v3'
  | 'qwen3-vl-embedding'
  | 'qwen2.5-vl-embedding'
  | 'tongyi-embedding-vision-plus'
  | 'tongyi-embedding-vision-flash'
  | 'multimodal-embedding-v1'
  | 'tongyi-embedding-vision-plus-2026-03-06'
  | (string & {});

const alibabaEmbeddingContentSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    text: z.string(),
  }),
  z.object({
    type: z.literal('image'),
    image: z.string(),
  }),
  z.object({
    type: z.literal('video'),
    video: z.string(),
  }),
  z.object({
    type: z.literal('multiImages'),
    images: z.array(z.string()).min(1).max(8),
  }),
]);

export const alibabaEmbeddingModelOptions = z.object({
  /**
   * Differentiates query text from document text for asymmetric retrieval tasks.
   * Defaults to `document`.
   */
  textType: z.enum(['query', 'document']).optional(),

  /**
   * The dimension of the output embedding vectors. Defaults to 1024.
   *
   * Supported values vary by model.
   */
  dimension: z
    .union([
      z.literal(64),
      z.literal(128),
      z.literal(256),
      z.literal(512),
      z.literal(768),
      z.literal(1024),
      z.literal(1152),
      z.literal(1536),
      z.literal(2048),
      z.literal(2560),
    ])
    .optional(),

  /**
   * The output vector type. Defaults to `dense`.
   *
   * Sparse-only output is not supported by the AI SDK embedding interface,
   * which requires dense number arrays.
   */
  outputType: z.enum(['dense', 'sparse', 'dense&sparse']).optional(),

  /**
   * Additional multimodal content to embed with the text value.
   * Images can be public URLs or Base64 data URIs. Videos must be public URLs.
   */
  content: z.array(alibabaEmbeddingContentSchema).optional(),

  /**
   * Video frame extraction rate. Lower values extract fewer frames.
   *
   * @default 1
   */
  fps: z.number().min(0).max(1).optional(),

  /**
   * Custom task description to guide query intent.
   */
  instruct: z.string().optional(),

  /**
   * Whether to fuse all multimodal content into a single embedding.
   * Supported by `qwen3-vl-embedding`; `qwen2.5-vl-embedding` is fused-only.
   */
  enableFusion: z.boolean().optional(),

  /**
   * Resolution level for `tongyi-embedding-vision-plus-2026-03-06`.
   */
  resLevel: z
    .union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)])
    .optional(),

  /**
   * Maximum number of sampled video frames for `tongyi-embedding-vision-plus-2026-03-06`.
   */
  maxVideoFrames: z.number().int().positive().max(64).optional(),
});

export type AlibabaEmbeddingModelOptions = z.infer<
  typeof alibabaEmbeddingModelOptions
>;
