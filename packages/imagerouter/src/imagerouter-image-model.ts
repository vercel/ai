import {
  ImageModelV3,
  ImageModelV3File,
  SharedV3Warning,
} from '@ai-sdk/provider';
import type { Resolvable } from '@ai-sdk/provider-utils';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  convertToFormData,
  createJsonResponseHandler,
  downloadBlob,
  FetchFunction,
  parseProviderOptions,
  postFormDataToApi,
  postJsonToApi,
  resolve,
} from '@ai-sdk/provider-utils';
import { imagerouterImageResponseSchema } from './imagerouter-image-api';
import { imagerouterFailedResponseHandler } from './imagerouter-error';
import { imagerouterImageProviderOptionsSchema } from './imagerouter-image-options';
import { ImageRouterImageModelId } from './imagerouter-image-settings';

interface ImageRouterImageModelConfig {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
}

export class ImageRouterImageModel implements ImageModelV3 {
  readonly specificationVersion = 'v3';
  readonly maxImagesPerCall = 1; // ImageRouter supports 1 image per call

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: ImageRouterImageModelId,
    private readonly config: ImageRouterImageModelConfig,
  ) {}

  async doGenerate(
    options: Parameters<ImageModelV3['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<ImageModelV3['doGenerate']>>> {
    const {
      prompt,
      n,
      size,
      aspectRatio,
      seed,
      providerOptions,
      headers,
      abortSignal,
      files,
      mask,
    } = options;
    const warnings: Array<SharedV3Warning> = [];

    if (aspectRatio != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'aspectRatio',
        details: 'ImageRouter does not support aspect ratio. Use `size` instead.',
      });
    }

    if (seed != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'seed',
        details: 'Seed support depends on the specific model being used.',
      });
    }

    const imagerouterOptions = await parseProviderOptions({
      provider: 'imagerouter',
      providerOptions,
      schema: imagerouterImageProviderOptionsSchema,
    });

    const currentDate = this.config._internal?.currentDate?.() ?? new Date();

    // Image editing mode: use multipart/form-data with /images/edits endpoint
    if (files != null && files.length > 0) {
      const { value: response, responseHeaders } = await postFormDataToApi({
        url: `${this.config.baseURL}/v1/openai/images/edits`,
        headers: combineHeaders(await resolve(this.config.headers), headers),
        formData: convertToFormData({
          model: this.modelId,
          prompt,
          image: await Promise.all(files.map(file => fileToBlob(file))),
          mask: mask != null ? await fileToBlob(mask) : undefined,
          n,
          size,
          response_format: 'b64_json',
          ...imagerouterOptions,
        }),
        failedResponseHandler: imagerouterFailedResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(
          imagerouterImageResponseSchema,
        ),
        abortSignal,
        fetch: this.config.fetch,
      });

      const images = response.data.map(item => {
        if (item.b64_json) {
          return convertBase64ToUint8Array(item.b64_json);
        }
        throw new Error('ImageRouter returned URL instead of base64 data');
      });

      return {
        images,
        warnings,
        response: {
          modelId: this.modelId,
          timestamp: currentDate,
          headers: responseHeaders,
        },
        providerMetadata: {
          imagerouter: {
            images: response.data.map(item => ({
              ...(item.revised_prompt
                ? { revisedPrompt: item.revised_prompt }
                : {}),
              created: response.created ?? undefined,
            })),
          },
        },
      };
    }

    // Text-to-image mode: use JSON with /images/generations endpoint
    const requestBody: Record<string, unknown> = {
      model: this.modelId,
      prompt,
      n,
      size,
      // Default to b64_json for consistency with other providers
      response_format: 'b64_json',
      ...imagerouterOptions,
    };

    const { value: response, responseHeaders } = await postJsonToApi({
      url: `${this.config.baseURL}/v1/openai/images/generations`,
      headers: combineHeaders(await resolve(this.config.headers), headers),
      body: requestBody,
      failedResponseHandler: imagerouterFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        imagerouterImageResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    // Convert images from response
    const images = response.data.map(item => {
      if (item.b64_json) {
        return convertBase64ToUint8Array(item.b64_json);
      }
      // If URL is provided instead (shouldn't happen with b64_json format)
      throw new Error('ImageRouter returned URL instead of base64 data');
    });

    return {
      images,
      warnings,
      response: {
        modelId: this.modelId,
        timestamp: currentDate,
        headers: responseHeaders,
      },
      providerMetadata: {
        imagerouter: {
          images: response.data.map(item => ({
            ...(item.revised_prompt
              ? { revisedPrompt: item.revised_prompt }
              : {}),
            created: response.created ?? undefined,
          })),
        },
      },
    };
  }
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
