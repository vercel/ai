import { z } from 'zod';

// Common types
export const ImageResponseSchema = z
  .object({
    content_type: z.string().optional(),
    height: z.number().optional(),
    url: z.string().optional(),
    width: z.number().optional(),
  })
  .passthrough();

export type Image = z.infer<typeof ImageResponseSchema>;

export const ImageSizeSchema = z
  .object({
    height: z.number(),
    width: z.number(),
  })
  .passthrough();

export type ImageSize = z.infer<typeof ImageSizeSchema>;

export const IdeogramAspectRatioSchema = z.enum([
  'ASPECT_1_1',
  'ASPECT_10_16',
  'ASPECT_16_10',
  'ASPECT_9_16',
  'ASPECT_16_9',
  'ASPECT_3_2',
  'ASPECT_2_3',
  'ASPECT_4_3',
  'ASPECT_3_4',
  'ASPECT_1_3',
  'ASPECT_3_1',
]);

export type IdeogramAspectRatio = z.infer<typeof IdeogramAspectRatioSchema>;

// Flux V1.1 Ultra
export const FluxV11UltraRequestSchema = z
  .object({
    aspect_ratio: z.string(),
    prompt: z.string(),
    raw: z.boolean(),
  })
  .passthrough();

export type FluxV11UltraRequest = z.infer<typeof FluxV11UltraRequestSchema>;

export const FluxV11UltraResponseSchema = z
  .object({
    has_nsfw_concepts: z.array(z.boolean()),
    images: z.array(ImageResponseSchema),
    prompt: z.string(),
    seed: z.number(),
    timings: z.record(z.string(), z.any()),
  })
  .passthrough();

export type FluxV11UltraResponse = z.infer<typeof FluxV11UltraResponseSchema>;

// Flux Pro V1.1
export const FluxProV11RequestSchema = z
  .object({
    guidance_scale: z.number().optional(),
    image_size: ImageSizeSchema.optional(),
    num_inference_steps: z.number().optional(),
    prompt: z.string(),
  })
  .passthrough();

export type FluxProV11Request = z.infer<typeof FluxProV11RequestSchema>;

export const FluxProV11ResponseSchema = z
  .object({
    has_nsfw_concepts: z.array(z.boolean()),
    images: z.array(ImageResponseSchema),
    prompt: z.string(),
    seed: z.number(),
    timings: z.record(z.string(), z.any()),
  })
  .passthrough();

export type FluxProV11Response = z.infer<typeof FluxProV11ResponseSchema>;

// Flux Pro & Dev
export const FluxProDevRequestSchema = z
  .object({
    guidance_scale: z.number().optional().default(3.5),
    image_size: ImageSizeSchema,
    num_inference_steps: z.number().optional().default(28),
    prompt: z.string(),
  })
  .passthrough();

export type FluxProDevRequest = z.infer<typeof FluxProDevRequestSchema>;

export const FluxProDevResponseSchema = z
  .object({
    images: z.array(
      z.object({
        url: z.string(),
        width: z.number(),
        height: z.number(),
        content_type: z.string(),
      }),
    ),
    timings: z.record(z.string(), z.number()),
    seed: z.number(),
    has_nsfw_concepts: z.array(z.boolean()),
    prompt: z.string(),
  })
  .passthrough();

export type FluxProDevResponse = z.infer<typeof FluxProDevResponseSchema>;

// Flux Schnell
export const FluxSchnellRequestSchema = z
  .object({
    image_size: ImageSizeSchema.optional(),
    num_inference_steps: z.number().optional(),
    prompt: z.string(),
  })
  .passthrough();

export type FluxSchnellRequest = z.infer<typeof FluxSchnellRequestSchema>;

export const FluxSchnellResponseSchema = z
  .object({
    images: z.array(
      z.object({
        url: z.string(),
        width: z.number(),
        height: z.number(),
        content_type: z.string(),
      }),
    ),
    timings: z.record(z.string(), z.number()),
    seed: z.number(),
    has_nsfw_concepts: z.array(z.boolean()),
    prompt: z.string(),
  })
  .passthrough();

export type FluxSchnellResponse = z.infer<typeof FluxSchnellResponseSchema>;

// Ideogram
export const IdeogramResolutionSchema = z.enum([
  'RESOLUTION_512_1536',
  'RESOLUTION_576_1408',
  'RESOLUTION_576_1472',
  'RESOLUTION_576_1536',
  'RESOLUTION_640_1024',
  'RESOLUTION_640_1344',
  'RESOLUTION_640_1408',
  'RESOLUTION_640_1472',
  'RESOLUTION_640_1536',
  'RESOLUTION_704_1152',
  'RESOLUTION_704_1216',
  'RESOLUTION_704_1280',
  'RESOLUTION_704_1344',
  'RESOLUTION_704_1408',
  'RESOLUTION_704_1472',
  'RESOLUTION_720_1280',
  'RESOLUTION_736_1312',
  'RESOLUTION_768_1024',
  'RESOLUTION_768_1088',
  'RESOLUTION_768_1152',
  'RESOLUTION_768_1216',
  'RESOLUTION_768_1232',
  'RESOLUTION_768_1280',
  'RESOLUTION_768_1344',
  'RESOLUTION_832_960',
  'RESOLUTION_832_1024',
  'RESOLUTION_832_1088',
  'RESOLUTION_832_1152',
  'RESOLUTION_832_1216',
  'RESOLUTION_832_1248',
  'RESOLUTION_864_1152',
  'RESOLUTION_896_960',
  'RESOLUTION_896_1024',
  'RESOLUTION_896_1088',
  'RESOLUTION_896_1120',
  'RESOLUTION_896_1152',
  'RESOLUTION_960_832',
  'RESOLUTION_960_896',
  'RESOLUTION_960_1024',
  'RESOLUTION_960_1088',
  'RESOLUTION_1024_640',
  'RESOLUTION_1024_768',
  'RESOLUTION_1024_832',
  'RESOLUTION_1024_896',
  'RESOLUTION_1024_960',
  'RESOLUTION_1024_1024',
  'RESOLUTION_1088_768',
  'RESOLUTION_1088_832',
  'RESOLUTION_1088_896',
  'RESOLUTION_1088_960',
  'RESOLUTION_1120_896',
  'RESOLUTION_1152_704',
  'RESOLUTION_1152_768',
  'RESOLUTION_1152_832',
  'RESOLUTION_1152_864',
  'RESOLUTION_1152_896',
  'RESOLUTION_1216_704',
  'RESOLUTION_1216_768',
  'RESOLUTION_1216_832',
  'RESOLUTION_1232_768',
  'RESOLUTION_1248_832',
  'RESOLUTION_1280_704',
  'RESOLUTION_1280_720',
  'RESOLUTION_1280_768',
  'RESOLUTION_1280_800',
  'RESOLUTION_1312_736',
  'RESOLUTION_1344_640',
  'RESOLUTION_1344_704',
  'RESOLUTION_1344_768',
  'RESOLUTION_1408_576',
  'RESOLUTION_1408_640',
  'RESOLUTION_1408_704',
  'RESOLUTION_1472_576',
  'RESOLUTION_1472_640',
  'RESOLUTION_1472_704',
  'RESOLUTION_1536_512',
  'RESOLUTION_1536_576',
  'RESOLUTION_1536_640',
]);

export type IdeogramResolution = z.infer<typeof IdeogramResolutionSchema>;

export const IdeogramRequestSchema = z
  .object({
    image_request: z
      .object({
        aspect_ratio:
          IdeogramAspectRatioSchema.optional().default('ASPECT_1_1'),
        magic_prompt_option: z
          .enum(['AUTO', 'ON', 'OFF'])
          .optional()
          .default('AUTO'),
        model: z
          .enum(['V_1', 'V_1_TURBO', 'V_2', 'V_2_TURBO'])
          .optional()
          .default('V_2'),
        negative_prompt: z.string().optional(),
        prompt: z.string(),
        resolution: IdeogramResolutionSchema.optional(),
        seed: z.number().optional(),
        style_type: z
          .enum(['GENERAL', 'REALISTIC', 'DESIGN', 'RENDER_3D', 'ANIME'])
          .optional()
          .default('GENERAL'),
      })
      .passthrough(),
  })
  .passthrough();

export type IdeogramRequest = z.infer<typeof IdeogramRequestSchema>;

export const IdeogramImageDataSchema = z
  .object({
    is_image_safe: z.boolean(),
    prompt: z.string(),
    resolution: z.string(),
    seed: z.number(),
    url: z.string(),
  })
  .passthrough();

export type IdeogramImageData = z.infer<typeof IdeogramImageDataSchema>;

export const IdeogramResponseSchema = z
  .object({
    created: z.string(),
    data: z.array(IdeogramImageDataSchema),
  })
  .passthrough();

export type IdeogramResponse = z.infer<typeof IdeogramResponseSchema>;

// DALL-E
export const DallERequestSchema = z
  .object({
    prompt: z.string(),
    model: z.enum(['dall-e-3']),
    size: z.string(),
  })
  .passthrough();

export type DallERequest = z.infer<typeof DallERequestSchema>;

export const DallEImageDataSchema = z
  .object({
    revised_prompt: z.string().optional(),
    url: z.string(),
  })
  .passthrough();

export type DallEImageData = z.infer<typeof DallEImageDataSchema>;

export const DallEResponseSchema = z
  .object({
    created: z.number(),
    data: z.array(DallEImageDataSchema),
  })
  .passthrough();

export type DallEResponse = z.infer<typeof DallEResponseSchema>;

// Recraft V3
export const RecraftTextLayoutSchema = z
  .object({
    text: z.string(),
    bbox: z.array(z.tuple([z.number(), z.number()])).length(4),
  })
  .passthrough();

export type RecraftTextLayout = z.infer<typeof RecraftTextLayoutSchema>;

export const RecraftControlsSchema = z
  .object({
    colors: z
      .array(
        z.object({
          rgb: z.tuple([z.number(), z.number(), z.number()]),
        }),
      )
      .optional(),
    background_color: z.string().optional(),
  })
  .passthrough();

export type RecraftControls = z.infer<typeof RecraftControlsSchema>;

export const RecraftStyleSchema = z.enum([
  'realistic_image',
  'digital_illustration',
  'vector_illustration',
  'icon',
]);

export type RecraftStyle = z.infer<typeof RecraftStyleSchema>;

export const RecraftResponseSchema = z
  .object({
    images: z.array(
      z.object({
        url: z.string(),
        content_type: z.string(),
        file_size: z.number(),
      }),
    ),
  })
  .passthrough();

export type RecraftResponse = z.infer<typeof RecraftResponseSchema>;

// SDXL Lightning V2
export const SDXLLightningImageSizeSchema = z
  .object({
    width: z.number(),
    height: z.number(),
  })
  .passthrough();

export type SDXLLightningImageSize = z.infer<
  typeof SDXLLightningImageSizeSchema
>;

export const SDXLLightningRequestSchema = z
  .object({
    prompt: z.string(),
    image_size: SDXLLightningImageSizeSchema,
    embeddings: z.array(z.any()).optional(),
    format: z.enum(['jpeg', 'png']).optional(),
  })
  .passthrough();

export type SDXLLightningRequest = z.infer<typeof SDXLLightningRequestSchema>;

export const SDXLLightningImageDataSchema = z
  .object({
    url: z.string(),
    width: z.number(),
    height: z.number(),
    content_type: z.string(),
  })
  .passthrough();

export type SDXLLightningImageData = z.infer<
  typeof SDXLLightningImageDataSchema
>;

export const SDXLLightningResponseSchema = z
  .object({
    images: z.array(SDXLLightningImageDataSchema),
    timings: z.record(z.string(), z.number()),
    seed: z.number(),
    has_nsfw_concepts: z.array(z.boolean()),
    prompt: z.string(),
  })
  .passthrough();

export type SDXLLightningResponse = z.infer<typeof SDXLLightningResponseSchema>;

// Kolors
export const KolorsImageSizeSchema = z
  .object({
    width: z.number(),
    height: z.number(),
  })
  .passthrough();

export type KolorsImageSize = z.infer<typeof KolorsImageSizeSchema>;

export const KolorsRequestSchema = z
  .object({
    prompt: z.string(),
    negative_prompt: z.string().optional(),
    guidance_scale: z.number().optional(),
    image_size: KolorsImageSizeSchema,
  })
  .passthrough();

export type KolorsRequest = z.infer<typeof KolorsRequestSchema>;

export const KolorsImageDataSchema = z
  .object({
    url: z.string(),
    width: z.number(),
    height: z.number(),
    content_type: z.string(),
  })
  .passthrough();

export type KolorsImageData = z.infer<typeof KolorsImageDataSchema>;

export const KolorsResponseSchema = z
  .object({
    images: z.array(KolorsImageDataSchema),
    timings: z.record(z.string(), z.number()),
    seed: z.number(),
    has_nsfw_concepts: z.array(z.boolean()),
    prompt: z.string(),
  })
  .passthrough();

export type KolorsResponse = z.infer<typeof KolorsResponseSchema>;

// Auraflow
export const AuraflowImageDataSchema = z
  .object({
    url: z.string(),
    content_type: z.string(),
    file_size: z.number(),
    width: z.number(),
    height: z.number(),
  })
  .passthrough();

export type AuraflowImageData = z.infer<typeof AuraflowImageDataSchema>;

export const AuraflowResponseSchema = z
  .object({
    images: z.array(AuraflowImageDataSchema),
    seed: z.number(),
    prompt: z.string(),
  })
  .passthrough();

export type AuraflowResponse = z.infer<typeof AuraflowResponseSchema>;

// Luma Photon
export const LumaPhotonAspectRatioSchema = z.enum([
  '1:1',
  '3:4',
  '4:3',
  '9:16',
  '16:9',
  '9:21',
  '21:9',
]);

export type LumaPhotonAspectRatio = z.infer<typeof LumaPhotonAspectRatioSchema>;

export const LumaPhotonRequestSchema = z
  .object({
    prompt: z.string(),
    aspect_ratio: LumaPhotonAspectRatioSchema.optional().default('16:9'),
  })
  .passthrough();

export type LumaPhotonRequest = z.infer<typeof LumaPhotonRequestSchema>;

export const LumaPhotonImageDataSchema = z
  .object({
    url: z.string(),
    content_type: z.string(),
    file_size: z.number(),
  })
  .passthrough();

export type LumaPhotonImageData = z.infer<typeof LumaPhotonImageDataSchema>;

export const LumaPhotonResponseSchema = z
  .object({
    images: z.array(LumaPhotonImageDataSchema),
  })
  .passthrough();

export type LumaPhotonResponse = z.infer<typeof LumaPhotonResponseSchema>;

// SDXL
export const SDXLRequestSchema = z
  .object({
    prompt: z.string(),
    negative_prompt: z.string().optional(),
    width: z.string().optional(),
    height: z.string().optional(),
  })
  .passthrough();

export type SDXLRequest = z.infer<typeof SDXLRequestSchema>;

export const SDXLResponseSchema = z
  .object({
    completed_at: z.string(),
    created_at: z.string(),
    error: z.string(),
    id: z.string(),
    model: z.string(),
    output: z.string(), // JSON string of URLs array
    started_at: z.string(),
    status: z.enum(['succeeded', 'failed']),
  })
  .passthrough();

export type SDXLResponse = z.infer<typeof SDXLResponseSchema>;

// SD3-Ultra
export const SD3UltraAspectRatioSchema = z.enum([
  '16:9',
  '1:1',
  '21:9',
  '2:3',
  '3:2',
  '4:5',
  '5:4',
  '9:16',
  '9:21',
]);

export type SD3UltraAspectRatio = z.infer<typeof SD3UltraAspectRatioSchema>;

export const SD3UltraRequestSchema = z
  .object({
    prompt: z.string(),
    negative_prompt: z.string().optional(),
    aspect_ratio: SD3UltraAspectRatioSchema.optional().default('1:1'),
    output_format: z.enum(['jpeg', 'png']).optional(),
    seed: z.number().optional(),
  })
  .passthrough();

export type SD3UltraRequest = z.infer<typeof SD3UltraRequestSchema>;

// SD3
export const SD3ImageSizeSchema = z.enum([
  '1024x1024',
  '1024x2048',
  '1536x1024',
  '1536x2048',
  '2048x1152',
  '1152x2048',
]);

export type SD3ImageSize = z.infer<typeof SD3ImageSizeSchema>;

export const SD3RequestSchema = z
  .object({
    prompt: z.string(),
    image_size: SD3ImageSizeSchema.optional().default('1024x1024'),
    batch_size: z.number().min(1).max(4).optional().default(1),
    num_inference_steps: z.number().min(1).max(100).optional().default(20),
    guidance_scale: z.number().min(0).max(100).optional().default(7.5),
  })
  .passthrough();

export type SD3Request = z.infer<typeof SD3RequestSchema>;

export const SD3ImageDataSchema = z
  .object({
    url: z.string(),
    content_type: z.string(),
    file_size: z.number(),
  })
  .passthrough();

export type SD3ImageData = z.infer<typeof SD3ImageDataSchema>;

export const SD3ResponseSchema = z
  .object({
    images: z.array(SD3ImageDataSchema),
  })
  .passthrough();

export type SD3Response = z.infer<typeof SD3ResponseSchema>;

// SD3.5
export const SD35AspectRatioSchema = z.enum([
  '16:9',
  '1:1',
  '21:9',
  '2:3',
  '3:2',
  '4:5',
  '5:4',
  '9:16',
  '9:21',
]);

export type SD35AspectRatio = z.infer<typeof SD35AspectRatioSchema>;

export const SD35ModelSchema = z.enum([
  'sd3.5-large',
  'sd3.5-large-turbo',
  'sd3.5-medium',
]);

export type SD35Model = z.infer<typeof SD35ModelSchema>;

export const SD35RequestSchema = z
  .object({
    prompt: z.string(),
    aspect_ratio: SD35AspectRatioSchema.optional().default('1:1'),
    mode: z
      .enum(['text-to-image', 'image-to-image'])
      .optional()
      .default('text-to-image'),
    model: SD35ModelSchema,
    negative_prompt: z.string().optional(),
    output_format: z.enum(['jpeg', 'png']).optional(),
    seed: z.number().optional(),
  })
  .passthrough();

export type SD35Request = z.infer<typeof SD35RequestSchema>;

// Midjourney
export const MidjourneyBotTypeSchema = z.enum(['MID_JOURNEY', 'NIJI_JOURNEY']);

export type MidjourneyBotType = z.infer<typeof MidjourneyBotTypeSchema>;

export const MidjourneySubmitRequestSchema = z
  .object({
    prompt: z.string(),
    botType: MidjourneyBotTypeSchema.optional().default('MID_JOURNEY'),
    state: z.string().optional(),
  })
  .passthrough();

export type MidjourneySubmitRequest = z.infer<
  typeof MidjourneySubmitRequestSchema
>;

export const MidjourneySubmitResponseSchema = z
  .object({
    code: z.number(),
    description: z.string(),
    result: z.string(),
  })
  .passthrough();

export type MidjourneySubmitResponse = z.infer<
  typeof MidjourneySubmitResponseSchema
>;

export const MidjourneyButtonSchema = z
  .object({
    customId: z.string(),
    emoji: z.string(),
    label: z.string(),
    style: z.number(),
    type: z.number(),
  })
  .passthrough();

export type MidjourneyButton = z.infer<typeof MidjourneyButtonSchema>;

export const MidjourneyTaskStatusSchema = z.enum([
  'IN_PROGRESS',
  'SUCCESS',
  'FAILED',
]);

export type MidjourneyTaskStatus = z.infer<typeof MidjourneyTaskStatusSchema>;

export const MidjourneyTaskResponseSchema = z
  .object({
    action: z.string(),
    botType: z.string(),
    buttons: z.array(MidjourneyButtonSchema),
    customId: z.string(),
    description: z.string(),
    failReason: z.string(),
    finishTime: z.number(),
    id: z.string(),
    imageUrl: z.string(),
    maskBase64: z.string(),
    mode: z.string(),
    progress: z.string(),
    prompt: z.string(),
    promptEn: z.string(),
    proxy: z.string(),
    startTime: z.number(),
    state: z.string(),
    status: MidjourneyTaskStatusSchema,
    submitTime: z.number(),
  })
  .passthrough();

export type MidjourneyTaskResponse = z.infer<
  typeof MidjourneyTaskResponseSchema
>;

export const MidjourneyActionRequestSchema = z
  .object({
    customId: z.string(),
    taskId: z.string(),
  })
  .passthrough();

export type MidjourneyActionRequest = z.infer<
  typeof MidjourneyActionRequestSchema
>;

// Omnigen V1
export const OmnigenRequestSchema = z
  .object({
    prompt: z.string(),
    negative_prompt: z.string().optional(),
    image_size: ImageSizeSchema.optional(),
    num_inference_steps: z.number().optional(),
    guidance_scale: z.number().optional(),
    output_format: z.string().optional(),
    seed: z.number().optional(),
  })
  .passthrough();

export type OmnigenRequest = z.infer<typeof OmnigenRequestSchema>;

export const OmnigenImageDataSchema = z
  .object({
    url: z.string(),
    content_type: z.string(),
    file_size: z.number(),
    width: z.number(),
    height: z.number(),
  })
  .passthrough();

export type OmnigenImageData = z.infer<typeof OmnigenImageDataSchema>;

export const OmnigenResponseSchema = z
  .object({
    images: z.array(OmnigenImageDataSchema),
    seed: z.number(),
    has_nsfw_concepts: z.array(z.boolean()),
    debug_latents: z.any().nullable(),
    debug_per_pass_latents: z.any().nullable(),
  })
  .passthrough();

export type OmnigenResponse = z.infer<typeof OmnigenResponseSchema>;

// CogView-4
export const CogViewRequestSchema = z
  .object({
    model: z.string(),
    prompt: z.string(),
    size: z.string().optional(),
  })
  .passthrough();

export type CogViewRequest = z.infer<typeof CogViewRequestSchema>;

export const CogViewImageDataSchema = z
  .object({
    url: z.string(),
  })
  .passthrough();

export type CogViewImageData = z.infer<typeof CogViewImageDataSchema>;

export const CogViewResponseSchema = z
  .object({
    created: z.number(),
    data: z.array(CogViewImageDataSchema),
  })
  .passthrough();

export type CogViewResponse = z.infer<typeof CogViewResponseSchema>;

// Minimax Image
export const MinimaxRequestSchema = z
  .object({
    model: z.string(),
    prompt: z.string(),
    aspect_ratio: z.string().optional(),
    prompt_optimizer: z.boolean().optional(),
    response_format: z.string().optional(),
  })
  .passthrough();

export type MinimaxRequest = z.infer<typeof MinimaxRequestSchema>;

export const MinimaxResponseSchema = z
  .object({
    base_resp: z.object({
      status_code: z.number(),
      status_msg: z.string(),
    }),
    data: z.object({
      image_urls: z.array(z.string()),
    }),
    id: z.string(),
    metadata: z.object({
      failed_count: z.string(),
      success_count: z.string(),
    }),
  })
  .passthrough();

export type MinimaxResponse = z.infer<typeof MinimaxResponseSchema>;

export interface IRAGResponse {
  id: string;
  created: number;
  data: Array<{
    url: string;
  }>;
}

// 302.ai GPT Image
export const GPTImageSizeSchema = z.enum([
  '1024x1024',
  '1536x1024',
  '1024x1536',
]);

export type GPTImageSize = z.infer<typeof GPTImageSizeSchema>;

export const GPTImageBackgroundSchema = z.enum([
  'transparent',
  'opaque',
  'auto',
]);

export type GPTImageBackground = z.infer<typeof GPTImageBackgroundSchema>;

export const GPTImageQualitySchema = z.enum(['auto', 'high', 'medium', 'low']);

export type GPTImageQuality = z.infer<typeof GPTImageQualitySchema>;

export const GPTImageRequestSchema = z
  .object({
    prompt: z.string(),
    model: z.string().optional(),
    size: GPTImageSizeSchema.optional().default('1024x1024'),
    background: GPTImageBackgroundSchema.optional(),
    quality: GPTImageQualitySchema.optional(),
    n: z.number().min(1).max(10).optional(),
    response_format: z.enum(['url', 'b64_json']).optional(),
  })
  .passthrough();

export type GPTImageRequest = z.infer<typeof GPTImageRequestSchema>;

export const GPTImageDataSchema = z
  .object({
    url: z.string().optional(),
    b64_json: z.string().optional(),
  })
  .passthrough();

export type GPTImageData = z.infer<typeof GPTImageDataSchema>;

export const GPTImageResponseSchema = z
  .object({
    created: z.number(),
    data: z.array(GPTImageDataSchema),
    usage: z
      .object({
        prompt_tokens: z.number(),
        completion_tokens: z.number(),
        total_tokens: z.number(),
        input_tokens: z.number(),
        output_tokens: z.number(),
        input_tokens_details: z.object({
          text_tokens: z.number(),
          cached_tokens_details: z.record(z.string(), z.any()),
        }),
        prompt_tokens_details: z.object({
          cached_tokens_details: z.record(z.string(), z.any()),
        }),
        completion_tokens_details: z.record(z.string(), z.any()),
      })
      .optional(),
  })
  .passthrough();

export type GPTImageResponse = z.infer<typeof GPTImageResponseSchema>;

// Bagel
export const BagelRequestSchema = z
  .object({
    prompt: z.string(),
    use_thought: z.boolean().optional(),
  })
  .passthrough();

export type BagelRequest = z.infer<typeof BagelRequestSchema>;

export const BagelImageDataSchema = z
  .object({
    url: z.string(),
    content_type: z.string(),
    file_size: z.number(),
    width: z.number(),
    height: z.number(),
  })
  .passthrough();

export type BagelImageData = z.infer<typeof BagelImageDataSchema>;

export const BagelResponseSchema = z
  .object({
    images: z.array(BagelImageDataSchema),
    seed: z.number(),
    has_nsfw_concepts: z.array(z.boolean()),
    debug_latents: z.any().nullable(),
    debug_per_pass_latents: z.any().nullable(),
  })
  .passthrough();

export type BagelResponse = z.infer<typeof BagelResponseSchema>;

// Flux Kontext
export const FluxKontextRequestSchema = z
  .object({
    prompt: z.string(),
    input_image: z.string().nullable().optional(),
    seed: z.number().nullable().optional(),
    aspect_ratio: z.string().nullable().optional(),
    output_format: z.enum(['jpeg', 'png']).optional().default('png'),
    webhook_url: z.string().url().min(1).max(2083).nullable().optional(),
    webhook_secret: z.string().nullable().optional(),
    prompt_upsampling: z.boolean().optional().default(false),
    safety_tolerance: z.number().min(0).max(6).optional().default(2),
  })
  .passthrough();

export type FluxKontextRequest = z.infer<typeof FluxKontextRequestSchema>;

export const FluxKontextSubmitResponseSchema = z
  .object({
    id: z.string(),
    polling_url: z.string(),
  })
  .passthrough();

export type FluxKontextSubmitResponse = z.infer<
  typeof FluxKontextSubmitResponseSchema
>;

export const FluxKontextResultDataSchema = z
  .object({
    seed: z.number(),
    prompt: z.string(),
    sample: z.string(),
    duration: z.number(),
    end_time: z.number(),
    start_time: z.number(),
  })
  .passthrough();

export type FluxKontextResultData = z.infer<typeof FluxKontextResultDataSchema>;

export const FluxKontextResultResponseSchema = z
  .object({
    id: z.string(),
    result: FluxKontextResultDataSchema.optional(),
    status: z.string(),
  })
  .passthrough();

export type FluxKontextResultResponse = z.infer<
  typeof FluxKontextResultResponseSchema
>;

// Soul
export const SoulQualitySchema = z.enum(['720p', '1080p']);

export type SoulQuality = z.infer<typeof SoulQualitySchema>;

export const SoulAspectRatioSchema = z.enum([
  '9:16',
  '3:4',
  '2:3',
  '1:1',
  '4:3',
  '16:9',
  '3:2',
]);

export type SoulAspectRatio = z.infer<typeof SoulAspectRatioSchema>;

export const SoulRequestSchema = z
  .object({
    quality: SoulQualitySchema,
    aspect_ratio: SoulAspectRatioSchema,
    prompt: z.string(),
    enhance_prompt: z.boolean(),
    seed: z.number(),
    style_id: z.string(),
    negative_prompt: z.string(),
  })
  .passthrough();

export type SoulRequest = z.infer<typeof SoulRequestSchema>;

export const SoulSubmitResponseSchema = z
  .object({
    id: z.string(),
  })
  .passthrough();

export type SoulSubmitResponse = z.infer<typeof SoulSubmitResponseSchema>;

export const SoulJobResultSchema = z
  .object({
    min: z.object({
      type: z.string(),
      url: z.string(),
    }),
    raw: z.object({
      type: z.string(),
      url: z.string(),
    }),
  })
  .passthrough();

export type SoulJobResult = z.infer<typeof SoulJobResultSchema>;

export const SoulJobSchema = z
  .object({
    board_ids: z.array(z.string()),
    created_at: z.number(),
    id: z.string(),
    meta: z.object({}).passthrough(),
    results: SoulJobResultSchema,
    status: z.string(),
  })
  .passthrough();

export type SoulJob = z.infer<typeof SoulJobSchema>;

export const SoulTaskResponseSchema = z
  .object({
    id: z.string(),
    jobs: z.array(SoulJobSchema).optional(),
  })
  .passthrough();

export type SoulTaskResponse = z.infer<typeof SoulTaskResponseSchema>;

// Kling
export const KlingAspectRatioSchema = z.enum([
  '16:9',
  '9:16',
  '1:1',
  '4:3',
  '3:4',
  '3:2',
  '2:3',
]);

export type KlingAspectRatio = z.infer<typeof KlingAspectRatioSchema>;

export const KlingRequestSchema = z
  .object({
    model_name: z.enum(['kling-v1', 'kling-v1-5', 'kling-v2']),
    prompt: z.string(),
    negative_prompt: z.string().optional(),
    image: z.string().optional(),
    image_reference: z.enum(['face', 'subject']).optional(),
    image_fidelity: z.number().min(0).max(1).optional(),
    human_fidelity: z.number().min(0).max(1).optional(),
    n: z.number().min(1).max(9).optional(),
    aspect_ratio: KlingAspectRatioSchema.optional(),
  })
  .passthrough();

export type KlingRequest = z.infer<typeof KlingRequestSchema>;

export const KlingSubmitResponseSchema = z
  .object({
    code: z.number(),
    data: z.object({
      task_id: z.string(),
      task_status: z.string(),
    }),
    message: z.string(),
  })
  .passthrough();

export type KlingSubmitResponse = z.infer<typeof KlingSubmitResponseSchema>;

export const KlingTaskResponseSchema = z
  .object({
    code: z.number(),
    data: z.object({
      task_id: z.string(),
      task_result: z
        .object({
          images: z
            .array(
              z.object({
                url: z.string(),
              }),
            )
            .optional(),
        })
        .optional(),
      task_status: z.string(),
      task_status_msg: z.string(),
    }),
    message: z.string(),
  })
  .passthrough();

export type KlingTaskResponse = z.infer<typeof KlingTaskResponseSchema>;

// Flux-1-Krea
export const FluxKreaRequestSchema = z
  .object({
    prompt: z.string(),
    image_size: ImageSizeSchema.optional(),
    num_inference_steps: z.number().optional(),
    guidance_scale: z.number().optional(),
  })
  .passthrough();

export type FluxKreaRequest = z.infer<typeof FluxKreaRequestSchema>;

export const FluxKreaResponseSchema = z
  .object({
    images: z.array(
      z.object({
        url: z.string().optional(),
        content_type: z.string().optional(),
        file_size: z.number().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
      }),
    ),
    seed: z.number(),
    has_nsfw_concepts: z.array(z.boolean()),
    debug_latents: z.string().nullable(),
    debug_per_pass_latents: z.string().nullable(),
  })
  .passthrough();

export type FluxKreaResponse = z.infer<typeof FluxKreaResponseSchema>;

// Doubao Seedream (OpenAI-compatible format)
export const DoubaoSeedreamRequestSchema = z
  .object({
    model: z.string(),
    prompt: z.string(),
    image: z.array(z.string()).optional(),
    sequential_image_generation: z.enum(['auto', 'disabled']).optional(),
    sequential_image_generation_options: z
      .object({
        max_images: z.number().min(1).max(15).optional(),
      })
      .optional(),
    response_format: z.enum(['url', 'b64_json']).optional().default('url'),
    size: z.string().optional().default('1024x1024'),
    stream: z.boolean().optional().default(false),
    watermark: z.boolean().optional().default(false),
    seed: z.number().min(-1).max(2147483647).optional(),
    guidance_scale: z.number().min(1).max(10).optional(),
  })
  .passthrough();

export type DoubaoSeedreamRequest = z.infer<typeof DoubaoSeedreamRequestSchema>;

export const DoubaoSeedreamDataSchema = z
  .object({
    url: z.string().optional(),
    b64_json: z.string().optional(),
  })
  .passthrough();

export type DoubaoSeedreamData = z.infer<typeof DoubaoSeedreamDataSchema>;

export const DoubaoSeedreamResponseSchema = z
  .object({
    model: z.string(),
    created: z.number(),
    data: z.array(DoubaoSeedreamDataSchema),
    usage: z.object({
      generated_images: z.number(),
    }),
  })
  .passthrough();

export type DoubaoSeedreamResponse = z.infer<
  typeof DoubaoSeedreamResponseSchema
>;

// Qwen Image
export const QwenImageAspectRatioSchema = z.enum([
  '1:1',
  '16:9',
  '9:16',
  '3:4',
  '4:3',
]);

export type QwenImageAspectRatio = z.infer<typeof QwenImageAspectRatioSchema>;

export const QwenImageRequestSchema = z
  .object({
    prompt: z.string(),
    aspect_ratio: QwenImageAspectRatioSchema.optional().default('1:1'),
  })
  .passthrough();

export type QwenImageRequest = z.infer<typeof QwenImageRequestSchema>;

export const QwenImageResponseSchema = z
  .object({
    completed_at: z.string(),
    created_at: z.string(),
    error: z.string(),
    id: z.string(),
    model: z.string(),
    output: z.string(),
    started_at: z.string(),
    status: z.enum(['succeeded', 'failed']),
  })
  .passthrough();

export type QwenImageResponse = z.infer<typeof QwenImageResponseSchema>;
