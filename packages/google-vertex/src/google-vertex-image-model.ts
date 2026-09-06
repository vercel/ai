import type { GoogleLanguageModelOptions } from '@ai-sdk/google';
import { GoogleLanguageModel } from '@ai-sdk/google/internal';
import type {
  ImageModelV4,
  LanguageModelV4Prompt,
  SharedV4Warning,
} from '@ai-sdk/provider';
import {
  convertToBase64,
  generateId as defaultGenerateId,
  serializeModelOptions,
  WORKFLOW_SERIALIZE,
  WORKFLOW_DESERIALIZE,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import type { GoogleVertexImageModelId } from './google-vertex-image-settings';

interface GoogleVertexImageModelConfig {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: typeof fetch;
  generateId?: () => string;
  _internal?: {
    currentDate?: () => Date;
  };
}

export class GoogleVertexImageModel implements ImageModelV4 {
  readonly specificationVersion = 'v4';

  static [WORKFLOW_SERIALIZE](model: GoogleVertexImageModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: string;
    config: GoogleVertexImageModelConfig;
  }) {
    return new GoogleVertexImageModel(options.modelId, options.config);
  }

  readonly maxImagesPerCall = 10;

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: GoogleVertexImageModelId,
    private config: GoogleVertexImageModelConfig,
  ) {}

  async doGenerate(
    options: Parameters<ImageModelV4['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<ImageModelV4['doGenerate']>>> {
    if (!this.modelId.startsWith('gemini-')) {
      throw new Error(
        'Google image models other than Gemini are no longer supported. Use a model ID that starts with `gemini-`.',
      );
    }

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
    const warnings: Array<SharedV4Warning> = [];

    if (mask != null) {
      throw new Error(
        'Gemini image models do not support mask-based image editing.',
      );
    }

    if (n != null && n > 1) {
      throw new Error(
        'Gemini image models do not support generating a set number of images per call. Use n=1 or omit the n parameter.',
      );
    }

    if (size != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'size',
        details:
          'This model does not support the `size` option. Use `aspectRatio` instead.',
      });
    }

    const userContent: Array<
      | { type: 'text'; text: string }
      | {
          type: 'file';
          data:
            | { type: 'data'; data: string | Uint8Array }
            | { type: 'url'; url: URL };
          mediaType: string;
        }
    > = [];

    if (prompt != null) {
      userContent.push({ type: 'text', text: prompt });
    }

    if (files != null && files.length > 0) {
      for (const file of files) {
        if (file.type === 'url') {
          userContent.push({
            type: 'file',
            data: { type: 'url', url: new URL(file.url) },
            mediaType: 'image/*',
          });
        } else {
          userContent.push({
            type: 'file',
            data: {
              type: 'data',
              data:
                typeof file.data === 'string'
                  ? file.data
                  : new Uint8Array(file.data),
            },
            mediaType: file.mediaType,
          });
        }
      }
    }

    const languageModelPrompt: LanguageModelV4Prompt = [
      { role: 'user', content: userContent },
    ];

    const languageModel = new GoogleLanguageModel(this.modelId, {
      provider: this.config.provider,
      baseURL: this.config.baseURL,
      headers: this.config.headers ?? {},
      fetch: this.config.fetch,
      generateId: this.config.generateId ?? defaultGenerateId,
      supportedUrls: () => ({
        '*': [/^https?:\/\/.*$/, /^gs:\/\/.*$/],
      }),
    });

    const {
      responseModalities: _strippedResponseModalities,
      imageConfig: userImageConfig,
      ...userVertexOptions
    } = ((providerOptions?.googleVertex ?? providerOptions?.vertex) as
      | GoogleLanguageModelOptions
      | undefined) ?? {};
    const innerVertexOptions: GoogleLanguageModelOptions = {
      ...userVertexOptions,
      responseModalities: ['IMAGE'],
      imageConfig:
        aspectRatio != null || userImageConfig != null
          ? {
              ...userImageConfig,
              ...(aspectRatio != null
                ? {
                    aspectRatio: aspectRatio as NonNullable<
                      GoogleLanguageModelOptions['imageConfig']
                    >['aspectRatio'],
                  }
                : {}),
            }
          : undefined,
    };
    const result = await languageModel.doGenerate({
      prompt: languageModelPrompt,
      seed,
      providerOptions: {
        googleVertex: innerVertexOptions,
        vertex: innerVertexOptions,
      },
      headers,
      abortSignal,
    });

    const currentDate = this.config._internal?.currentDate?.() ?? new Date();

    const images: string[] = [];
    for (const part of result.content) {
      if (
        part.type === 'file' &&
        part.mediaType.startsWith('image/') &&
        part.data.type === 'data'
      ) {
        images.push(convertToBase64(part.data.data));
      }
    }

    const geminiPayload = {
      images: images.map(() => ({})),
    };
    return {
      images,
      warnings,
      providerMetadata: {
        googleVertex: geminiPayload,
        vertex: geminiPayload,
      },
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: result.response?.headers,
      },
      usage: result.usage
        ? {
            inputTokens: result.usage.inputTokens.total,
            outputTokens: result.usage.outputTokens.total,
            totalTokens:
              (result.usage.inputTokens.total ?? 0) +
              (result.usage.outputTokens.total ?? 0),
          }
        : undefined,
    };
  }
}
