import type {
  ImageModelV4,
  ImageModelV4CallOptions,
  ImageModelV4Result,
  SharedV4Warning,
} from '@ai-sdk/provider';
import {
  alibabaImageModelGenerationOptions,
  type AlibabaImageModelId,
  type AlibabaImageModelOptions,
} from './alibaba-image-model-options';
import {
  combineHeaders,
  convertUint8ArrayToBase64,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  parseProviderOptions,
  postJsonToApi,
  resolve,
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  type FetchFunction,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import {
  alibabaImageGenerationErrorResponseSchema,
  alibabaImageGenerationResponseSchema,
} from './alibaba-image-model-api';

interface AlibabaImageModelConfig {
  provider: string;
  baseURL: string;
  headers: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
}

/**
 * @see https://www.alibabacloud.com/help/en/model-studio/qwen-image-generation-and-editing-api-reference#dashscope-synchronous-api-recommended
 */
export class AlibabaImageModel implements ImageModelV4 {
  readonly specificationVersion = 'v4';

  get maxImagesPerCall(): number {
    return 1;
  }

  get provider(): string {
    return this.config.provider;
  }

  static [WORKFLOW_SERIALIZE](model: AlibabaImageModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: AlibabaImageModelId;
    config: AlibabaImageModelConfig;
  }) {
    return new AlibabaImageModel(options.modelId, options.config);
  }

  private async getHeaders(
    headers?: Record<string, string | undefined>,
  ): Promise<Record<string, string | undefined>> {
    return combineHeaders(await resolve(this.config.headers), headers);
  }

  constructor(
    readonly modelId: AlibabaImageModelId,
    private readonly config: AlibabaImageModelConfig,
  ) {}

  async doGenerate({
    prompt,
    n,
    seed,
    size,
    aspectRatio,
    mask,
    files,
    providerOptions,
    headers,
    abortSignal,
  }: ImageModelV4CallOptions): Promise<ImageModelV4Result> {
    const warnings: Array<SharedV4Warning> = [];
    if (aspectRatio != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'aspectRatio',
        details:
          'The aspectRatio option is not supported by the Alibaba image generation model.',
      });
    }

    if (mask != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'mask',
        details:
          'The mask option is not supported by the Alibaba image generation model.',
      });
    }

    if (files != null && files.length > 3) {
      warnings.push({
        type: 'unsupported',
        feature: 'files',
        details:
          'The Alibaba image generation model supports a maximum of 3 files. Additional files will be ignored based on the order they are provided.',
      });
    }

    const resolvedHeaders = await this.getHeaders(headers);
    const alibabaOptions =
      (await parseProviderOptions({
        provider: 'alibaba',
        providerOptions,
        schema: alibabaImageModelGenerationOptions,
      })) ?? {};

    const imagesContent =
      files != null && files.length > 0
        ? files.map(file => {
            return file.type === 'url'
              ? { image: file.url }
              : {
                  image:
                    typeof file.data === 'string'
                      ? file.data
                      : `data:${file.mediaType};base64,${convertUint8ArrayToBase64(file.data)}`,
                };
          })
        : [];

    const { value: response, responseHeaders } = await postJsonToApi({
      url: `${this.config.baseURL}/api/v1/services/aigc/multimodal-generation/generation`,
      body: {
        model: this.modelId,
        input: {
          messages: [
            { role: 'user', content: [{ text: prompt }, ...imagesContent] },
          ],
        },
        parameters: {
          n: n ?? alibabaOptions?.n,
          seed: seed ?? alibabaOptions?.seed,
          size: updateImageResolution(size ?? alibabaOptions?.size),
          enable_thinking: alibabaOptions?.enable_thinking,
          negative_prompt: alibabaOptions?.negative_prompt,
          prompt_extend: alibabaOptions?.prompt_extend,
          prompt_extend_model: alibabaOptions?.prompt_extend_model,
          watermark: alibabaOptions?.watermark,
        } as AlibabaImageModelOptions,
      },
      headers: resolvedHeaders,
      fetch: this.config.fetch,
      abortSignal,
      failedResponseHandler: createJsonErrorResponseHandler({
        errorSchema: alibabaImageGenerationErrorResponseSchema,
        errorToMessage: data => data.message,
      }),
      successfulResponseHandler: createJsonResponseHandler(
        alibabaImageGenerationResponseSchema,
      ),
    });
    const timestamp = new Date();

    return {
      images: response.output.choices.flatMap(choice =>
        choice.message.content.map(content => content.image),
      ),
      warnings,
      response: {
        headers: responseHeaders,
        modelId: this.modelId,
        timestamp,
      },
      usage: {
        inputTokens: response.usage.input_image_count,
        outputTokens: response.usage.output_image_count,
        totalTokens:
          response.usage.input_image_count + response.usage.output_image_count,
      },
      providerMetadata: {
        alibaba: {
          images: response.output.choices.map(choice => ({
            image: choice.message.content.flatMap(content => content.image),
            finishReason: choice.finish_reason,
          })),
        },
      },
    };
  }
}

function updateImageResolution(size: string | undefined): string | undefined {
  return size?.replace(/(\d+)x(\d+)/, (_, width, height) => {
    return `${width}*${height}`;
  });
}
