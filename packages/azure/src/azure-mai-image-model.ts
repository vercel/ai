import type {
  ImageModelV4,
  ImageModelV4File,
  ImageModelV4Usage,
  SharedV4Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  downloadBlob,
  postFormDataToApi,
  postJsonToApi,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { AzureImageModelMaiOptions } from './azure-mai-image-model-options';

// MAI rejects either side below 768px; 1024x1024 is its default output.
const MIN_SIDE = 768;
const DEFAULT_PIXELS = 1024 * 1024;

/**
 * MAI image generations and edits (`/mai/v1/images/*`) on Azure AI Foundry.
 * The API returns one PNG per request and takes `width`/`height`, not `size`.
 */
export class AzureMaiImageModel implements ImageModelV4 {
  readonly specificationVersion = 'v4';
  readonly provider = 'azure.image';
  readonly maxImagesPerCall = 1;
  readonly supportsFileInputs = true;
  readonly supportsMaskInputs = false;

  constructor(
    readonly modelId: string,
    private readonly config: {
      url: (path: string) => string;
      headers: () => Record<string, string | undefined>;
      fetch?: FetchFunction;
      _internal?: { currentDate?: () => Date };
    },
  ) {}

  async doGenerate(
    {
      prompt,
      n,
      size,
      aspectRatio,
      seed,
      files,
      mask,
      headers,
      abortSignal,
    }: Parameters<ImageModelV4['doGenerate']>[0],
    { autoAspectRatio, webGrounding }: AzureImageModelMaiOptions = {},
  ): Promise<Awaited<ReturnType<ImageModelV4['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const warnings: SharedV4Warning[] = [];

    if (seed != null) {
      warnings.push({ type: 'unsupported', feature: 'seed' });
    }
    if (mask != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'mask',
        details: 'MAI image edits do not support masks.',
      });
    }

    let dimensions = parseSize(size);
    if (size != null && aspectRatio != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'aspectRatio',
        details: 'aspectRatio is ignored when size is set.',
      });
    } else if (aspectRatio != null) {
      dimensions = dimensionsForAspectRatio(aspectRatio);
      if (dimensions == null) {
        warnings.push({
          type: 'unsupported',
          feature: 'aspectRatio',
          details: `Invalid aspect ratio: ${aspectRatio}.`,
        });
      }
    }

    const fields = {
      model: this.modelId,
      prompt,
      width: dimensions?.width,
      height: dimensions?.height,
      auto_aspect_ratio: autoAspectRatio,
      web_grounding: webGrounding,
    };
    const requestOptions = {
      headers: combineHeaders(this.config.headers(), headers),
      failedResponseHandler: maiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        maiImageResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    };
    const images =
      files != null && files.length > 0
        ? await Promise.all(files.map(file => fileToBlob(file, abortSignal)))
        : undefined;

    // The API ignores `n`, so a call reached with n > 1 (e.g. through an
    // `api: 'mai'` override) sends one request per image.
    const responses = await Promise.all(
      Array.from({ length: Math.max(1, n) }, () =>
        images != null
          ? postFormDataToApi({
              ...requestOptions,
              url: this.config.url('/images/edits'),
              formData: toFormData(fields, images),
            })
          : postJsonToApi({
              ...requestOptions,
              url: this.config.url('/images/generations'),
              body: fields,
            }),
      ),
    );

    let usage: ImageModelV4Usage | undefined;
    const metadata: Array<Record<string, number | string>> = [];
    for (const { value: response } of responses) {
      const textTokens = response.usage?.num_input_text_tokens ?? undefined;
      const imageTokens = response.usage?.num_input_image_tokens ?? undefined;
      if (response.usage != null) {
        const inputTokens = addTokens(textTokens, imageTokens);
        const outputTokens = response.usage.num_output_tokens ?? undefined;
        usage = {
          inputTokens: addTokens(usage?.inputTokens, inputTokens),
          outputTokens: addTokens(usage?.outputTokens, outputTokens),
          totalTokens: addTokens(
            usage?.totalTokens,
            addTokens(inputTokens, outputTokens),
          ),
        };
      }
      metadata.push(
        ...response.data.map(() => ({
          ...(response.created != null ? { created: response.created } : {}),
          ...(response.size != null ? { size: response.size } : {}),
          ...(textTokens != null ? { textTokens } : {}),
          ...(imageTokens != null ? { imageTokens } : {}),
        })),
      );
    }

    return {
      images: responses.flatMap(({ value }) =>
        value.data.map(item => item.b64_json),
      ),
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responses[0]?.responseHeaders,
      },
      usage,
      providerMetadata: { azure: { images: metadata } },
    };
  }
}

function addTokens(a: number | undefined, b: number | undefined) {
  return a == null && b == null ? undefined : (a ?? 0) + (b ?? 0);
}

function parseSize(size: `${number}x${number}` | undefined) {
  if (size == null) return undefined;
  const [width, height] = size.split('x').map(Number);
  return { width, height };
}

// Keeps the default 1024x1024 pixel budget, raising the short side to 768.
export function dimensionsForAspectRatio(aspectRatio: string) {
  const [w, h] = aspectRatio.split(':').map(Number);
  if (!(w > 0 && h > 0)) return undefined;

  const ratio = w / h;
  let width = Math.sqrt(DEFAULT_PIXELS * ratio);
  let height = width / ratio;
  if (Math.min(width, height) < MIN_SIDE) {
    [width, height] =
      width < height
        ? [MIN_SIDE, MIN_SIDE / ratio]
        : [MIN_SIDE * ratio, MIN_SIDE];
  }

  const floor16 = (value: number) => Math.floor(value / 16 + 1e-9) * 16;
  return {
    width: Math.max(MIN_SIDE, floor16(width)),
    height: Math.max(MIN_SIDE, floor16(height)),
  };
}

function toFormData(
  fields: Record<string, string | number | boolean | undefined>,
  images: Blob[],
) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value != null) formData.append(key, String(value));
  }

  images.forEach((blob, index) => {
    const extension = blob.type === 'image/jpeg' ? 'jpg' : 'png';
    formData.append('image', blob, `image-${index + 1}.${extension}`);
  });
  return formData;
}

async function fileToBlob(
  file: ImageModelV4File,
  abortSignal: AbortSignal | undefined,
): Promise<Blob> {
  if (file.type === 'url') {
    return downloadBlob(file.url, { abortSignal });
  }

  const data =
    file.data instanceof Uint8Array
      ? file.data
      : convertBase64ToUint8Array(file.data);
  return new Blob([data as BlobPart], { type: file.mediaType });
}

const maiErrorSchema = z.object({
  error: z.object({
    code: z.union([z.string(), z.number()]).nullish(),
    message: z.string(),
  }),
});

const maiFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: maiErrorSchema,
  errorToMessage: data => data.error.message,
});

// Only the fields used here, to tolerate API additions.
const maiImageResponseSchema = z.object({
  created: z.number().nullish(),
  size: z.string().nullish(),
  usage: z
    .object({
      num_input_text_tokens: z.number().nullish(),
      num_input_image_tokens: z.number().nullish(),
      num_output_tokens: z.number().nullish(),
    })
    .nullish(),
  data: z.array(z.object({ b64_json: z.string() })),
});
