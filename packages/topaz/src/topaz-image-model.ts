import type {
  ImageModelV4,
  ImageModelV4CallOptions,
  ImageModelV4File,
  ImageModelV4Result,
  SharedV4Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  createBinaryResponseHandler,
  createJsonResponseHandler,
  getFromApi,
  mediaTypeToExtension,
  parseProviderOptions,
  postFormDataToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { TopazConfig } from './topaz-config';
import { topazFailedResponseHandler, TopazError } from './topaz-error';
import {
  topazImageModelOptionsSchema,
  type TopazImageModelOptions,
} from './topaz-image-model-options';
import {
  resolveTopazImageApiModelId,
  type TopazImageModelId,
} from './topaz-image-settings';

const DEFAULT_POLL_INTERVAL_MILLIS = 2000;
const DEFAULT_POLL_TIMEOUT_MILLIS = 600_000;

/**
 * Topaz enhances an image that the caller supplies, so `files` is required and
 * exactly one image is processed per call.
 */
export class TopazImageModel implements ImageModelV4 {
  readonly specificationVersion = 'v4';
  readonly maxImagesPerCall = 1;

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: TopazImageModelId,
    private readonly config: TopazConfig,
  ) {}

  async doGenerate(
    options: ImageModelV4CallOptions,
  ): Promise<ImageModelV4Result> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const warnings: SharedV4Warning[] = [];

    const topazOptions = (await parseProviderOptions({
      provider: 'topaz',
      providerOptions: options.providerOptions,
      schema: topazImageModelOptionsSchema,
    })) as TopazImageModelOptions | undefined;

    this.addUnsupportedWarnings(options, warnings);

    const formData = await this.buildFormData(options, topazOptions, warnings);

    const { value: submitResponse } = await postFormDataToApi({
      url: `${this.config.baseURL}/image/v1/enhance-gen/async`,
      headers: combineHeaders(this.config.headers(), options.headers),
      formData,
      successfulResponseHandler: createJsonResponseHandler(
        topazImageSubmitResponseSchema,
      ),
      failedResponseHandler: topazFailedResponseHandler,
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const processId = submitResponse.process_id;
    if (processId == null) {
      throw new TopazError({
        message: 'Topaz did not return a process_id for the enhance request.',
      });
    }

    const status = await this.waitForCompletion({
      processId,
      headers: options.headers,
      abortSignal: options.abortSignal,
      pollIntervalMillis:
        topazOptions?.pollIntervalMillis ?? DEFAULT_POLL_INTERVAL_MILLIS,
      pollTimeoutMillis:
        topazOptions?.pollTimeoutMillis ?? DEFAULT_POLL_TIMEOUT_MILLIS,
    });

    const { image, responseHeaders } = await this.download({
      processId,
      headers: options.headers,
      abortSignal: options.abortSignal,
    });

    return {
      images: [image],
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
      },
      providerMetadata: {
        topaz: {
          images: [
            {
              processId,
              ...(status.credits != null ? { credits: status.credits } : {}),
              ...(status.output_width != null
                ? { width: status.output_width }
                : {}),
              ...(status.output_height != null
                ? { height: status.output_height }
                : {}),
              ...(status.output_format != null
                ? { format: status.output_format }
                : {}),
            },
          ],
        },
      },
    };
  }

  private addUnsupportedWarnings(
    options: ImageModelV4CallOptions,
    warnings: SharedV4Warning[],
  ): void {
    if (options.prompt != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'prompt',
        details:
          'Topaz image models enhance an existing image and do not take a text prompt. ' +
          'The prompt was ignored.',
      });
    }

    if (options.aspectRatio != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'aspectRatio',
        details:
          'Topaz image models do not support aspectRatio. Use `size`, or the ' +
          '`outputWidth` / `outputHeight` provider options, to set output dimensions.',
      });
    }

    if (options.seed != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'seed',
        details: 'Topaz image models do not support seed.',
      });
    }

    if (options.mask != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'mask',
        details:
          'Topaz image models do not support masks. The mask was ignored.',
      });
    }

    if (options.n > 1) {
      warnings.push({
        type: 'unsupported',
        feature: 'n',
        details:
          'Topaz image models enhance one image per call. Only 1 image will be returned.',
      });
    }
  }

  private async buildFormData(
    options: ImageModelV4CallOptions,
    topazOptions: TopazImageModelOptions | undefined,
    warnings: SharedV4Warning[],
  ): Promise<FormData> {
    const file = options.files?.[0];

    if (file == null) {
      throw new TopazError({
        message:
          'Topaz image models enhance an existing image. Pass the input image via ' +
          'the `files` option.',
      });
    }

    if (options.files != null && options.files.length > 1) {
      warnings.push({
        type: 'unsupported',
        feature: 'files',
        details:
          'Topaz image models enhance one image per call. Only the first file was used.',
      });
    }

    const formData = new FormData();
    formData.append('model', resolveTopazImageApiModelId(this.modelId));

    if (file.type === 'url') {
      // Topaz fetches the source itself when given a URL, so the bytes never
      // need to pass through the SDK.
      formData.append('source_url', file.url);
    } else {
      const bytes =
        typeof file.data === 'string'
          ? convertBase64ToUint8Array(file.data)
          : file.data;
      const extension = mediaTypeToExtension(file.mediaType) ?? 'png';

      formData.append(
        'image',
        new File([bytes as BlobPart], `image.${extension}`, {
          type: file.mediaType,
        }),
      );
    }

    const { width, height } = parseSize(options.size);

    appendIfDefined(
      formData,
      'output_width',
      topazOptions?.outputWidth ?? width,
    );
    appendIfDefined(
      formData,
      'output_height',
      topazOptions?.outputHeight ?? height,
    );
    appendIfDefined(formData, 'output_format', topazOptions?.outputFormat);
    appendIfDefined(formData, 'crop_to_fill', topazOptions?.cropToFill);
    appendIfDefined(formData, 'webhook_url', topazOptions?.webhookUrl);

    // Model-specific settings use camelCase, unlike the request schema fields
    // above.
    appendIfDefined(
      formData,
      'enhancementStrength',
      topazOptions?.enhancementStrength,
    );
    appendIfDefined(formData, 'grain', topazOptions?.grain);
    appendIfDefined(formData, 'grainDensity', topazOptions?.grainDensity);
    appendIfDefined(formData, 'grainModel', topazOptions?.grainModel);
    appendIfDefined(formData, 'grainSize', topazOptions?.grainSize);
    appendIfDefined(formData, 'grainStrength', topazOptions?.grainStrength);
    appendIfDefined(formData, 'inputWidth', topazOptions?.inputWidth);
    appendIfDefined(formData, 'inputHeight', topazOptions?.inputHeight);

    return formData;
  }

  private async waitForCompletion({
    processId,
    headers,
    abortSignal,
    pollIntervalMillis,
    pollTimeoutMillis,
  }: {
    processId: string;
    headers: Record<string, string | undefined> | undefined;
    abortSignal: AbortSignal | undefined;
    pollIntervalMillis: number;
    pollTimeoutMillis: number;
  }): Promise<TopazImageStatusResponse> {
    const deadline = Date.now() + pollTimeoutMillis;

    while (true) {
      const { value: status } = await getFromApi({
        url: `${this.config.baseURL}/image/v1/status/${processId}`,
        // Built from the configured baseURL, not from response data.
        validateUrl: false,
        headers: combineHeaders(this.config.headers(), headers),
        successfulResponseHandler: createJsonResponseHandler(
          topazImageStatusResponseSchema,
        ),
        failedResponseHandler: topazFailedResponseHandler,
        abortSignal,
        fetch: this.config.fetch,
      });

      if (status.status === 'Completed') {
        return status;
      }

      if (status.status === 'Failed' || status.status === 'Cancelled') {
        throw new TopazError({
          message: `Topaz image enhancement ${status.status.toLowerCase()} for process ${processId}.`,
        });
      }

      if (Date.now() + pollIntervalMillis > deadline) {
        throw new TopazError({
          message:
            `Topaz image enhancement did not finish within ${pollTimeoutMillis}ms ` +
            `(process ${processId}, last status ${status.status ?? 'unknown'}). ` +
            'Increase the `pollTimeoutMillis` provider option if the job needs longer.',
        });
      }

      await delay(pollIntervalMillis, abortSignal);
    }
  }

  private async download({
    processId,
    headers,
    abortSignal,
  }: {
    processId: string;
    headers: Record<string, string | undefined> | undefined;
    abortSignal: AbortSignal | undefined;
  }): Promise<{
    image: Uint8Array;
    responseHeaders: Record<string, string> | undefined;
  }> {
    const { value: downloadResponse } = await getFromApi({
      url: `${this.config.baseURL}/image/v1/download/${processId}`,
      // Built from the configured baseURL, not from response data.
      validateUrl: false,
      headers: combineHeaders(this.config.headers(), headers),
      successfulResponseHandler: createJsonResponseHandler(
        topazImageDownloadResponseSchema,
      ),
      failedResponseHandler: topazFailedResponseHandler,
      abortSignal,
      fetch: this.config.fetch,
    });

    const downloadUrl = downloadResponse.download_url;
    if (downloadUrl == null) {
      throw new TopazError({
        message: `Topaz did not return a download URL for process ${processId}.`,
      });
    }

    const { value: image, responseHeaders } = await getFromApi({
      url: downloadUrl,
      // Comes from the Topaz response body and normally points at object
      // storage, so it is validated and the API key is withheld off-origin.
      validateUrl: true,
      credentialedOrigin: this.config.baseURL,
      trustedOrigin: this.config.baseURL,
      headers: combineHeaders(this.config.headers(), headers),
      successfulResponseHandler: createBinaryResponseHandler(),
      failedResponseHandler: topazFailedResponseHandler,
      abortSignal,
      fetch: this.config.fetch,
    });

    return { image, responseHeaders };
  }
}

function parseSize(size: `${number}x${number}` | undefined): {
  width: number | undefined;
  height: number | undefined;
} {
  if (size == null) {
    return { width: undefined, height: undefined };
  }

  const [width, height] = size.split('x').map(Number);
  return { width, height };
}

function appendIfDefined(
  formData: FormData,
  key: string,
  value: string | number | boolean | undefined,
): void {
  if (value !== undefined) {
    formData.append(key, String(value));
  }
}

function delay(millis: number, abortSignal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (abortSignal?.aborted) {
      reject(abortSignal.reason);
      return;
    }

    const timeout = setTimeout(() => {
      abortSignal?.removeEventListener('abort', onAbort);
      resolve();
    }, millis);

    function onAbort() {
      clearTimeout(timeout);
      reject(abortSignal?.reason);
    }

    abortSignal?.addEventListener('abort', onAbort, { once: true });
  });
}

const topazImageSubmitResponseSchema = z.object({
  process_id: z.string().nullish(),
  source_id: z.string().nullish(),
  eta: z.number().nullish(),
});

const topazImageStatusResponseSchema = z.object({
  status: z
    .enum(['Pending', 'Processing', 'Completed', 'Cancelled', 'Failed'])
    .nullish(),
  progress: z.number().nullish(),
  credits: z.number().nullish(),
  output_width: z.number().nullish(),
  output_height: z.number().nullish(),
  output_format: z.string().nullish(),
});

type TopazImageStatusResponse = z.infer<typeof topazImageStatusResponseSchema>;

const topazImageDownloadResponseSchema = z.object({
  download_url: z.string().nullish(),
  head_url: z.string().nullish(),
  expiry: z.union([z.string(), z.number()]).nullish(),
});

export type { ImageModelV4File as TopazImageInputFile };
