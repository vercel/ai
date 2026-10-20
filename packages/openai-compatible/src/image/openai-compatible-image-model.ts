import {
  InvalidResponseDataError,
  type ImageModelV3,
  type ImageModelV3File,
  type SharedV3ProviderOptions,
  type SharedV3Warning,
} from '@ai-sdk/provider';
import { toCamelCase } from '../utils/to-camel-case';
import {
  lazySchema,
  zodSchema,
  type InferSchema,
  combineHeaders,
  convertBase64ToUint8Array,
  convertToFormData,
  createBinaryResponseHandler,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  createStatusCodeErrorResponseHandler,
  downloadBlob,
  getFromApi,
  postFormDataToApi,
  postJsonToApi,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import {
  defaultOpenAICompatibleErrorStructure,
  type ProviderErrorStructure,
} from '../openai-compatible-error';
import type { OpenAICompatibleImageModelId } from './openai-compatible-image-settings';

export type OpenAICompatibleImageModelConfig = {
  provider: string;
  headers: () => Record<string, string | undefined>;
  url: (options: { modelId: string; path: string }) => string;
  fetch?: FetchFunction;
  errorStructure?: ProviderErrorStructure<any>;
  _internal?: {
    currentDate?: () => Date;
  };
};

export class OpenAICompatibleImageModel implements ImageModelV3 {
  readonly specificationVersion = 'v3';
  readonly maxImagesPerCall = 10;

  get provider(): string {
    return this.config.provider;
  }

  /**
   * The provider options key used to extract provider-specific options.
   */
  private get providerOptionsKey(): string {
    return this.config.provider.split('.')[0].trim();
  }

  constructor(
    readonly modelId: OpenAICompatibleImageModelId,
    private readonly config: OpenAICompatibleImageModelConfig,
  ) {}

  // TODO: deprecate non-camelCase keys and remove in future major version
  private getArgs(
    providerOptions: SharedV3ProviderOptions,
  ): Record<string, unknown> {
    return {
      ...providerOptions[this.providerOptionsKey],
      ...providerOptions[toCamelCase(this.providerOptionsKey)],
    };
  }

  async doGenerate({
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
  }: Parameters<ImageModelV3['doGenerate']>[0]): Promise<
    Awaited<ReturnType<ImageModelV3['doGenerate']>>
  > {
    const warnings: Array<SharedV3Warning> = [];

    if (aspectRatio != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'aspectRatio',
        details:
          'This model does not support aspect ratio. Use `size` instead.',
      });
    }

    if (seed != null) {
      warnings.push({ type: 'unsupported', feature: 'seed' });
    }

    const currentDate = this.config._internal?.currentDate?.() ?? new Date();

    const args = this.getArgs(providerOptions);
    const isEditing = files != null && files.length > 0;
    const url = this.config.url({
      path: isEditing ? '/images/edits' : '/images/generations',
      modelId: this.modelId,
    });
    const requestHeaders = combineHeaders(this.config.headers(), headers);

    // Image editing mode - use form data and /images/edits endpoint
    if (isEditing) {
      const { value: response, responseHeaders } = await postFormDataToApi({
        url,
        headers: requestHeaders,
        formData: convertToFormData<OpenAICompatibleFormDataInput>({
          model: this.modelId,
          prompt,
          image: await Promise.all(files.map(file => fileToBlob(file))),
          mask: mask != null ? await fileToBlob(mask) : undefined,
          n,
          size,
          ...args,
        }),
        failedResponseHandler: createJsonErrorResponseHandler(
          this.config.errorStructure ?? defaultOpenAICompatibleErrorStructure,
        ),
        successfulResponseHandler: createJsonResponseHandler(
          openaiCompatibleImageResponseSchema,
        ),
        abortSignal,
        fetch: this.config.fetch,
      });

      return {
        images: await this.getImages(response.data, {
          url,
          headers: requestHeaders,
          abortSignal,
        }),
        warnings,
        response: {
          timestamp: currentDate,
          modelId: this.modelId,
          headers: responseHeaders,
        },
      };
    }

    // Standard image generation mode - use JSON and /images/generations endpoint
    const { value: response, responseHeaders } = await postJsonToApi({
      url,
      headers: requestHeaders,
      body: {
        model: this.modelId,
        prompt,
        n,
        size,
        ...args,
        response_format: 'b64_json',
      },
      failedResponseHandler: createJsonErrorResponseHandler(
        this.config.errorStructure ?? defaultOpenAICompatibleErrorStructure,
      ),
      successfulResponseHandler: createJsonResponseHandler(
        openaiCompatibleImageResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    return {
      images: await this.getImages(response.data, {
        url,
        headers: requestHeaders,
        abortSignal,
      }),
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
      },
    };
  }

  private async getImages(
    data: InferSchema<typeof openaiCompatibleImageResponseSchema>['data'],
    options: {
      url: string;
      headers: Record<string, string | undefined>;
      abortSignal: AbortSignal | undefined;
    },
  ): Promise<string[] | Uint8Array[]> {
    // Preserve base64 responses without conversion
    if (data.every(image => image.b64_json != null)) {
      return data.map(image => image.b64_json!);
    }

    return Promise.all(
      data.map(async image => {
        if (image.b64_json != null) {
          return convertBase64ToUint8Array(image.b64_json);
        }

        if (image.url == null) {
          throw new InvalidResponseDataError({
            data: image,
            message: 'Expected url in the image response',
          });
        }

        const { value } = await getFromApi({
          url: image.url,
          validateUrl: true,
          trustedOrigin: options.url,
          credentialedOrigin: options.url,
          headers: options.headers,
          abortSignal: options.abortSignal,
          fetch: this.config.fetch,
          successfulResponseHandler: createBinaryResponseHandler(),
          failedResponseHandler: createStatusCodeErrorResponseHandler(),
        });
        return value;
      }),
    );
  }
}

// minimal version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const openaiCompatibleImageResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      data: z.array(
        z
          .object({
            b64_json: z.string().nullish(),
            url: z.string().nullish(),
          })
          .refine(image => image.b64_json != null || image.url != null, {
            message: 'Expected b64_json or url in the image response',
          }),
      ),
    }),
  ),
);

type OpenAICompatibleFormDataInput = {
  model: string;
  prompt: string | undefined;
  image: Blob | Blob[];
  mask?: Blob;
  n: number;
  size: `${number}x${number}` | undefined;
  [key: string]: unknown;
};

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
