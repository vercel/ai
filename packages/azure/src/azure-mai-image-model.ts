import type {
  ImageModelV3,
  ImageModelV3File,
  SharedV3Warning,
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
import type { AzureImageModelOptions } from './azure-image-model-options';

// MAI rejects either side below 768px; 1024x1024 is its default output.
const MIN_SIDE = 768;
const DEFAULT_PIXELS = 1024 * 1024;

type MaiImageOptions = Omit<AzureImageModelOptions, 'api'>;

/**
 * MAI image generations and edits (`/mai/v1/images/*`) on Azure AI Foundry.
 * The API returns one PNG per request and takes `width`/`height`, not `size`.
 */
export class AzureMaiImageModel {
  readonly provider = 'azure.image';

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
    }: Parameters<ImageModelV3['doGenerate']>[0],
    { autoAspectRatio, webGrounding }: MaiImageOptions = {},
  ): Promise<Awaited<ReturnType<ImageModelV3['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const warnings: SharedV3Warning[] = [];

    if (n > 1) {
      warnings.push({
        type: 'unsupported',
        feature: 'n',
        details: 'MAI image models return one image per request.',
      });
    }
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

    const { value: response, responseHeaders } =
      files != null && files.length > 0
        ? await postFormDataToApi({
            ...requestOptions,
            url: this.config.url('/images/edits'),
            formData: await toFormData(fields, files),
          })
        : await postJsonToApi({
            ...requestOptions,
            url: this.config.url('/images/generations'),
            body: fields,
          });

    const textTokens = response.usage?.num_input_text_tokens ?? undefined;
    const imageTokens = response.usage?.num_input_image_tokens ?? undefined;
    const inputTokens =
      textTokens == null && imageTokens == null
        ? undefined
        : (textTokens ?? 0) + (imageTokens ?? 0);
    const outputTokens = response.usage?.num_output_tokens ?? undefined;

    return {
      images: response.data.map(item => item.b64_json),
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
      },
      usage:
        response.usage != null
          ? {
              inputTokens,
              outputTokens,
              totalTokens:
                inputTokens == null && outputTokens == null
                  ? undefined
                  : (inputTokens ?? 0) + (outputTokens ?? 0),
            }
          : undefined,
      providerMetadata: {
        azure: {
          images: response.data.map(() => ({
            ...(response.created != null ? { created: response.created } : {}),
            ...(response.size != null ? { size: response.size } : {}),
            ...(textTokens != null ? { textTokens } : {}),
            ...(imageTokens != null ? { imageTokens } : {}),
          })),
        },
      },
    };
  }
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

async function toFormData(
  fields: Record<string, string | number | boolean | undefined>,
  files: ImageModelV3File[],
) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value != null) formData.append(key, String(value));
  }

  const blobs = await Promise.all(files.map(fileToBlob));
  blobs.forEach((blob, index) => {
    const extension = blob.type === 'image/jpeg' ? 'jpg' : 'png';
    formData.append('image', blob, `image-${index + 1}.${extension}`);
  });
  return formData;
}

async function fileToBlob(file: ImageModelV3File): Promise<Blob> {
  if (file.type === 'url') {
    return downloadBlob(file.url);
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
