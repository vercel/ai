import {
  APICallError,
  UnsupportedFunctionalityError,
  type ImageModelV4,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  type FetchFunction,
  type Resolvable,
  combineHeaders,
  convertImageModelFileToDataUri,
  createBinaryResponseHandler,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  createStatusCodeErrorResponseHandler,
  getFromApi,
  lazySchema,
  parseProviderOptions,
  postJsonToApi,
  resolve,
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { getMiniMaxImageModelEntry } from './minimax-model-catalog';
import {
  minimaxImageModelOptionsSchema,
  type MiniMaxImageModelId,
} from './minimax-image-model-options';

interface MiniMaxImageModelConfig {
  provider: string;
  baseURL: string;
  headers: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  _internal?: { currentDate?: () => Date };
}

export class MiniMaxImageModel implements ImageModelV4 {
  readonly specificationVersion = 'v4';
  readonly supportsFileInputs = true;
  readonly supportsMaskInputs = false;
  get maxImagesPerCall(): number {
    return getMiniMaxImageModelEntry().capabilities.image.maxImagesPerCall;
  }

  get provider(): string {
    return this.config.provider;
  }

  static [WORKFLOW_SERIALIZE](model: MiniMaxImageModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: MiniMaxImageModelId;
    config: MiniMaxImageModelConfig;
  }) {
    return new MiniMaxImageModel(options.modelId, options.config);
  }

  constructor(
    readonly modelId: MiniMaxImageModelId,
    private readonly config: MiniMaxImageModelConfig,
  ) {}

  async doGenerate(
    options: Parameters<ImageModelV4['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<ImageModelV4['doGenerate']>>> {
    try {
      return await this.generate(options);
    } catch (error) {
      if (APICallError.isInstance(error)) {
        // A failed response or download does not prove generation was not charged.
        throw new APICallError({
          message: error.message,
          url: error.url,
          requestBodyValues: error.requestBodyValues,
          statusCode: error.statusCode,
          responseHeaders: error.responseHeaders,
          responseBody: error.responseBody,
          data: error.data,
          cause: error,
          isRetryable: false,
        });
      }
      throw error;
    }
  }

  private async generate({
    prompt,
    n,
    size,
    aspectRatio,
    seed,
    files,
    mask,
    providerOptions,
    headers,
    abortSignal,
  }: Parameters<ImageModelV4['doGenerate']>[0]): Promise<
    Awaited<ReturnType<ImageModelV4['doGenerate']>>
  > {
    const warnings: SharedV4Warning[] = [];
    if (seed != null) warnings.push({ type: 'unsupported', feature: 'seed' });
    if (mask != null)
      throw new UnsupportedFunctionalityError({
        functionality: 'MiniMax image masks',
      });
    const options = await parseProviderOptions({
      provider: 'minimax',
      providerOptions,
      schema: minimaxImageModelOptionsSchema,
    });
    const hasFiles = files != null && files.length > 0;
    if (hasFiles && options?.disablePromptEnhanced != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'disablePromptEnhanced',
        details: 'MiniMax image edits always apply prompt enhancement.',
      });
    }
    const timestamp = this.config._internal?.currentDate?.() ?? new Date();
    const { value: response, responseHeaders } = await postJsonToApi({
      url: `${this.config.baseURL}/images/${hasFiles ? 'edits' : 'generations'}`,
      headers: combineHeaders(await resolve(this.config.headers), headers),
      body: {
        model: this.modelId,
        prompt,
        n,
        size,
        aspect_ratio: aspectRatio,
        area: options?.area,
        output_format: options?.outputFormat,
        output_compression: options?.outputCompression,
        ...(!hasFiles && {
          disable_prompt_enhanced: options?.disablePromptEnhanced,
        }),
        ...(hasFiles && {
          images: files.map(file => ({
            image_url: convertImageModelFileToDataUri(file),
          })),
        }),
        // URL output supports the full batch size without the base64 area limit.
        response_format: 'url',
      },
      failedResponseHandler: minimaxImageFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        minimaxImageResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });
    const successfulImages = response.data.filter((image, index) => {
      if (image.error != null) {
        warnings.push({
          type: 'other',
          message: `Image ${index + 1} failed: ${image.error.message}`,
        });
        return false;
      }
      return true;
    });
    const images = await Promise.all(
      successfulImages.map(async image => {
        if (image.url == null)
          throw new Error('MiniMax returned an image without a URL.');
        const { value } = await getFromApi({
          url: image.url,
          validateUrl: true,
          trustedOrigin: this.config.baseURL,
          successfulResponseHandler: createBinaryResponseHandler(),
          failedResponseHandler: createStatusCodeErrorResponseHandler(),
          abortSignal,
          fetch: this.config.fetch,
        });
        return value;
      }),
    );
    return {
      images,
      isRetryable: false,
      warnings,
      usage:
        response.usage == null
          ? undefined
          : {
              inputTokens: response.usage.input_tokens ?? undefined,
              outputTokens: response.usage.output_tokens ?? undefined,
              totalTokens: response.usage.total_tokens ?? undefined,
            },
      response: { timestamp, modelId: this.modelId, headers: responseHeaders },
      providerMetadata: {
        minimax: {
          images: successfulImages.map((image, index) => ({
            size: image.size ?? null,
            revisedPrompt: image.revised_prompt ?? null,
            ...(response.output_format != null && {
              outputFormat: response.output_format,
            }),
            ...(response.request_id != null && {
              requestId: response.request_id,
            }),
            // Core merges only per-image metadata; keep request usage once per call.
            ...(index === 0 &&
              response.usage != null && { usage: response.usage }),
          })),
        },
      },
    };
  }
}

const minimaxImageResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      data: z.array(
        z.object({
          url: z.string().nullish(),
          size: z.string().nullish(),
          revised_prompt: z.string().nullish(),
          error: z
            .object({ code: z.string().nullish(), message: z.string() })
            .nullish(),
        }),
      ),
      output_format: z.string().nullish(),
      request_id: z.string().nullish(),
      usage: z
        .object({
          generated_images: z.number().nullish(),
          input_tokens: z.number().nullish(),
          output_tokens: z.number().nullish(),
          total_tokens: z.number().nullish(),
          input_tokens_details: z
            .object({
              text_tokens: z.number().nullish(),
              image_tokens: z.number().nullish(),
            })
            .nullish(),
          output_tokens_details: z
            .object({ image_tokens: z.number().nullish() })
            .nullish(),
        })
        .nullish(),
    }),
  ),
);

const minimaxImageErrorSchema = lazySchema(() =>
  zodSchema(z.object({ error: z.object({ message: z.string() }) })),
);

const minimaxImageFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: minimaxImageErrorSchema,
  errorToMessage: data => data.error.message,
});
