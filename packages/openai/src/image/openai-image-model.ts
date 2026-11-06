import {
  InvalidArgumentError,
  type ImageModelV4,
  type ImageModelV4File,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  resolve,
  combineHeaders,
  convertBase64ToUint8Array,
  convertToFormData,
  createJsonResponseHandler,
  downloadBlob,
  parseProviderOptions,
  postFormDataToApi,
  postJsonToApi,
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import type { OpenAIConfig } from '../openai-config';
import { openaiFailedResponseHandler } from '../openai-error';
import { getOpenAIImageModelEntry } from '../openai-model-catalog';
import { openaiImageResponseSchema } from './openai-image-api';
import {
  getMaxImagesPerCall,
  hasDefaultResponseFormat,
  openaiImageModelEditOptions,
  openaiImageModelGenerationOptions,
  type OpenAIImageModelEditOptions,
  type OpenAIImageModelId,
} from './openai-image-model-options';
interface OpenAIImageModelConfig extends OpenAIConfig {
  imageInputCapabilities?: {
    supportsFileInputs: boolean | undefined;
    supportsMaskInputs: boolean | undefined;
  };
  _internal?: {
    currentDate?: () => Date;
  };
}

export class OpenAIImageModel implements ImageModelV4 {
  readonly specificationVersion = 'v4';

  static [WORKFLOW_SERIALIZE](model: OpenAIImageModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: OpenAIImageModelId;
    config: OpenAIImageModelConfig;
  }) {
    return new OpenAIImageModel(options.modelId, options.config);
  }

  get maxImagesPerCall(): number {
    return getMaxImagesPerCall(this.modelId);
  }

  get supportsFileInputs(): boolean | undefined {
    if (this.config.imageInputCapabilities != null) {
      return this.config.imageInputCapabilities.supportsFileInputs;
    }

    const support = getOpenAIImageModelEntry(this.modelId).capabilities.image
      .fileInput;
    return typeof support === 'boolean' ? support : undefined;
  }

  get supportsMaskInputs(): boolean | undefined {
    if (this.config.imageInputCapabilities != null) {
      return this.config.imageInputCapabilities.supportsMaskInputs;
    }

    const support = getOpenAIImageModelEntry(this.modelId).capabilities.image
      .maskInput;
    return typeof support === 'boolean' ? support : undefined;
  }

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: OpenAIImageModelId,
    private readonly config: OpenAIImageModelConfig,
  ) {}

  async doGenerate({
    prompt,
    files,
    mask,
    n,
    size,
    aspectRatio,
    seed,
    providerOptions,
    headers,
    abortSignal,
  }: Parameters<ImageModelV4['doGenerate']>[0]): Promise<
    Awaited<ReturnType<ImageModelV4['doGenerate']>>
  > {
    const warnings: Array<SharedV4Warning> = [];

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

    if (files != null) {
      const openaiOptions =
        (await parseProviderOptions({
          provider: 'openai',
          providerOptions,
          schema: openaiImageModelEditOptions,
        })) ?? {};

      if (mask != null && openaiOptions.markup != null) {
        throw new InvalidArgumentError({
          argument: 'providerOptions.openai.markup',
          message: '`markup` cannot be combined with `mask`.',
        });
      }

      const { value: response, responseHeaders } = await postFormDataToApi({
        url: this.config.url({
          path: '/images/edits',
          modelId: this.modelId,
        }),
        headers: combineHeaders(await resolve(this.config.headers), headers),
        formData: convertToFormData<OpenAIImageEditInput>({
          model: this.modelId,
          prompt,
          image: await Promise.all(
            files.map(file =>
              file.type === 'file'
                ? new Blob(
                    [
                      file.data instanceof Uint8Array
                        ? new Blob([file.data as BlobPart], {
                            type: file.mediaType,
                          })
                        : new Blob([convertBase64ToUint8Array(file.data)], {
                            type: file.mediaType,
                          }),
                    ],
                    { type: file.mediaType },
                  )
                : downloadBlob(file.url, { abortSignal }),
            ),
          ),
          mask: mask != null ? await fileToBlob(mask, abortSignal) : undefined,
          markup:
            openaiOptions.markup != null
              ? await markupToBlob(openaiOptions.markup, abortSignal)
              : undefined,
          n,
          size,
          quality: openaiOptions.quality,
          background: openaiOptions.background,
          output_format: openaiOptions.outputFormat,
          output_compression: openaiOptions.outputCompression,
          complexity: openaiOptions.complexity,
          input_fidelity: openaiOptions.inputFidelity,
          moderation: openaiOptions.moderation,
          user: openaiOptions.user,
          safety_identifier: openaiOptions.safetyIdentifier,
        }),
        failedResponseHandler: openaiFailedResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(
          openaiImageResponseSchema,
        ),
        abortSignal,
        fetch: this.config.fetch,
      });

      return {
        images: response.data.map(item => item.b64_json),
        warnings,
        usage:
          response.usage != null
            ? {
                inputTokens: response.usage.input_tokens ?? undefined,
                outputTokens: response.usage.output_tokens ?? undefined,
                totalTokens: response.usage.total_tokens ?? undefined,
              }
            : undefined,
        response: {
          timestamp: currentDate,
          modelId: this.modelId,
          headers: responseHeaders,
        },
        providerMetadata: {
          openai: {
            images: response.data.map((item, index) => ({
              ...(item.revised_prompt
                ? { revisedPrompt: item.revised_prompt }
                : {}),
              created: response.created ?? undefined,
              size: response.size ?? undefined,
              quality: response.quality ?? undefined,
              background: response.background ?? undefined,
              outputFormat: response.output_format ?? undefined,
              ...distributeTokenDetails(
                response.usage?.input_tokens_details,
                index,
                response.data.length,
              ),
            })),
          },
        },
      };
    }

    const openaiOptions =
      (await parseProviderOptions({
        provider: 'openai',
        providerOptions,
        schema: openaiImageModelGenerationOptions,
      })) ?? {};

    const { value: response, responseHeaders } = await postJsonToApi({
      url: this.config.url({
        path: '/images/generations',
        modelId: this.modelId,
      }),
      headers: combineHeaders(await resolve(this.config.headers), headers),
      body: {
        model: this.modelId,
        prompt,
        n,
        size,
        quality: openaiOptions.quality,
        style: openaiOptions.style,
        background: openaiOptions.background,
        moderation: openaiOptions.moderation,
        output_format: openaiOptions.outputFormat,
        output_compression: openaiOptions.outputCompression,
        complexity: openaiOptions.complexity,
        frame_count: openaiOptions.frameCount,
        frame_duration_ms: openaiOptions.frameDurationMs,
        user: openaiOptions.user,
        safety_identifier: openaiOptions.safetyIdentifier,
        ...(!hasDefaultResponseFormat(this.modelId)
          ? { response_format: 'b64_json' }
          : {}),
      },
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        openaiImageResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    return {
      images: response.data.map(item => item.b64_json),
      warnings,
      usage:
        response.usage != null
          ? {
              inputTokens: response.usage.input_tokens ?? undefined,
              outputTokens: response.usage.output_tokens ?? undefined,
              totalTokens: response.usage.total_tokens ?? undefined,
            }
          : undefined,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
      },
      providerMetadata: {
        openai: {
          images: response.data.map((item, index) => ({
            ...(item.revised_prompt
              ? { revisedPrompt: item.revised_prompt }
              : {}),
            created: response.created ?? undefined,
            size: response.size ?? undefined,
            quality: response.quality ?? undefined,
            background: response.background ?? undefined,
            outputFormat: response.output_format ?? undefined,
            ...distributeTokenDetails(
              response.usage?.input_tokens_details,
              index,
              response.data.length,
            ),
          })),
        },
      },
    };
  }
}

/**
 * Distributes input token details evenly across images, with the remainder
 * assigned to the last image so that summing across all entries gives the
 * exact total.
 */
function distributeTokenDetails(
  details:
    | { image_tokens?: number | null; text_tokens?: number | null }
    | null
    | undefined,
  index: number,
  total: number,
): { imageTokens?: number; textTokens?: number } {
  if (details == null) {
    return {};
  }

  const result: { imageTokens?: number; textTokens?: number } = {};

  if (details.image_tokens != null) {
    const base = Math.floor(details.image_tokens / total);
    const remainder = details.image_tokens - base * (total - 1);
    result.imageTokens = index === total - 1 ? remainder : base;
  }

  if (details.text_tokens != null) {
    const base = Math.floor(details.text_tokens / total);
    const remainder = details.text_tokens - base * (total - 1);
    result.textTokens = index === total - 1 ? remainder : base;
  }

  return result;
}

type OpenAIImageEditInput = {
  model: OpenAIImageModelId;
  prompt?: string;
  image: Blob | Blob[];
  mask?: Blob;
  markup?: Blob;
  n?: number;
  size?: `${number}x${number}`;
  quality?: OpenAIImageModelEditOptions['quality'];
  background?: OpenAIImageModelEditOptions['background'];
  output_format?: OpenAIImageModelEditOptions['outputFormat'];
  output_compression?: OpenAIImageModelEditOptions['outputCompression'];
  complexity?: OpenAIImageModelEditOptions['complexity'];
  input_fidelity?: OpenAIImageModelEditOptions['inputFidelity'];
  moderation?: OpenAIImageModelEditOptions['moderation'];
  user?: OpenAIImageModelEditOptions['user'];
  safety_identifier?: OpenAIImageModelEditOptions['safetyIdentifier'];
};

async function markupToBlob(
  markup: string,
  abortSignal: AbortSignal | undefined,
): Promise<Blob> {
  const dataUrl = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(markup);

  if (dataUrl == null) {
    return downloadBlob(markup, { abortSignal });
  }

  if (dataUrl[2] == null) {
    throw new InvalidArgumentError({
      argument: 'providerOptions.openai.markup',
      message: '`markup` data URLs must be base64 encoded.',
    });
  }

  return new Blob([convertBase64ToUint8Array(dataUrl[3]) as BlobPart], {
    type: dataUrl[1] || 'image/png',
  });
}

async function fileToBlob(
  file: ImageModelV4File | undefined,
  abortSignal: AbortSignal | undefined,
): Promise<Blob | undefined> {
  if (!file) return undefined;

  if (file.type === 'url') {
    return downloadBlob(file.url, { abortSignal });
  }

  const data =
    file.data instanceof Uint8Array
      ? file.data
      : convertBase64ToUint8Array(file.data);

  return new Blob([data as BlobPart], { type: file.mediaType });
}
