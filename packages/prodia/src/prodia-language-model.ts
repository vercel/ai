import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2CallWarning,
  LanguageModelV2Content,
  LanguageModelV2StreamPart,
} from '@ai-sdk/provider';
import type { InferSchema } from '@ai-sdk/provider-utils';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  generateId,
  lazySchema,
  parseJSON,
  parseProviderOptions,
  postFormDataToApi,
  resolve,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { ProdiaModelConfig } from './prodia-api';
import {
  buildProdiaProviderMetadata,
  parseMultipart,
  prodiaFailedResponseHandler,
  prodiaJobResultSchema,
} from './prodia-api';
import type { ProdiaJobResult } from './prodia-api';
import type { ProdiaLanguageModelId } from './prodia-language-model-settings';

export class ProdiaLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = 'v2';
  readonly supportedUrls = {};

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: ProdiaLanguageModelId,
    private readonly config: ProdiaModelConfig,
  ) {}

  async doGenerate(options: LanguageModelV2CallOptions) {
    const warnings: Array<LanguageModelV2CallWarning> = [];

    if (options.temperature !== undefined) {
      warnings.push({ type: 'unsupported-setting', setting: 'temperature' });
    }
    if (options.topP !== undefined) {
      warnings.push({ type: 'unsupported-setting', setting: 'topP' });
    }
    if (options.topK !== undefined) {
      warnings.push({ type: 'unsupported-setting', setting: 'topK' });
    }
    if (options.maxOutputTokens !== undefined) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'maxOutputTokens',
      });
    }
    if (options.stopSequences !== undefined) {
      warnings.push({ type: 'unsupported-setting', setting: 'stopSequences' });
    }
    if (options.presencePenalty !== undefined) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'presencePenalty',
      });
    }
    if (options.frequencyPenalty !== undefined) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'frequencyPenalty',
      });
    }
    if (options.tools !== undefined && options.tools.length > 0) {
      warnings.push({ type: 'unsupported-setting', setting: 'tools' });
    }
    if (options.toolChoice !== undefined) {
      warnings.push({ type: 'unsupported-setting', setting: 'toolChoice' });
    }
    if (
      options.responseFormat !== undefined &&
      options.responseFormat.type !== 'text'
    ) {
      warnings.push({ type: 'unsupported-setting', setting: 'responseFormat' });
    }

    const prodiaOptions = await parseProviderOptions({
      provider: 'prodia',
      providerOptions: options.providerOptions,
      schema: prodiaLanguageModelOptionsSchema,
    });

    let prompt = '';
    let systemMessage = '';
    for (const message of options.prompt) {
      if (message.role === 'system') {
        systemMessage = message.content;
      }
    }
    for (let i = options.prompt.length - 1; i >= 0; i--) {
      const message = options.prompt[i];
      if (message.role === 'user') {
        for (const part of message.content) {
          if (part.type === 'text') {
            prompt += (prompt ? '\n' : '') + part.text;
          }
        }
        break;
      }
    }
    if (systemMessage) {
      prompt = systemMessage + '\n' + prompt;
    }

    let imageBytes: Uint8Array | undefined;
    let imageMediaType = 'image/png';
    for (let i = options.prompt.length - 1; i >= 0; i--) {
      const message = options.prompt[i];
      if (message.role === 'user') {
        for (const part of message.content) {
          if (part.type === 'file' && part.mediaType.startsWith('image/')) {
            if (part.data instanceof Uint8Array) {
              imageBytes = part.data;
            } else if (typeof part.data === 'string') {
              imageBytes = convertBase64ToUint8Array(part.data);
            } else if (part.data instanceof URL) {
              const fetchFn = this.config.fetch ?? globalThis.fetch;
              const response = await fetchFn(part.data.toString());
              const arrayBuffer = await response.arrayBuffer();
              imageBytes = new Uint8Array(arrayBuffer);
            }
            imageMediaType = part.mediaType;
            break;
          }
        }
        break;
      }
    }

    const jobConfig: Record<string, unknown> = {
      prompt,
      include_messages: true,
    };

    if (prodiaOptions?.aspectRatio !== undefined) {
      jobConfig.aspect_ratio = prodiaOptions.aspectRatio;
    }

    const body = {
      type: this.modelId,
      config: jobConfig,
    };

    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const combinedHeaders = combineHeaders(
      await resolve(this.config.headers),
      options.headers,
    );

    const formData = new FormData();
    formData.append(
      'job',
      new Blob([JSON.stringify(body)], { type: 'application/json' }),
      'job.json',
    );
    if (imageBytes) {
      const ext =
        imageMediaType === 'image/png'
          ? '.png'
          : imageMediaType === 'image/jpeg'
            ? '.jpg'
            : imageMediaType === 'image/webp'
              ? '.webp'
              : '';
      formData.append(
        'input',
        new Blob([imageBytes], { type: imageMediaType }),
        'input' + ext,
      );
    }

    const { value: multipartResult, responseHeaders } = await postFormDataToApi(
      {
        url: `${this.config.baseURL}/job?price=true`,
        headers: {
          ...combinedHeaders,
          Accept: 'multipart/form-data',
        },
        formData,
        failedResponseHandler: prodiaFailedResponseHandler,
        successfulResponseHandler: createLanguageMultipartResponseHandler(),
        abortSignal: options.abortSignal,
        fetch: this.config.fetch,
      },
    );

    const { jobResult, textContent, fileContent } = multipartResult;

    const content: Array<LanguageModelV2Content> = [];
    if (textContent !== undefined) {
      content.push({ type: 'text', text: textContent });
    }
    for (const file of fileContent) {
      content.push({
        type: 'file',
        mediaType: file.mediaType,
        data: file.data,
      });
    }

    return {
      content,
      finishReason: 'stop' as const,
      usage: {
        inputTokens: undefined,
        outputTokens: undefined,
        totalTokens: undefined,
      },
      warnings,
      providerMetadata: {
        prodia: buildProdiaProviderMetadata(jobResult),
      },
      response: {
        modelId: this.modelId,
        timestamp: currentDate,
        headers: responseHeaders,
      },
    };
  }

  async doStream(options: LanguageModelV2CallOptions) {
    const result = await this.doGenerate(options);

    const stream = new ReadableStream<LanguageModelV2StreamPart>({
      start(controller) {
        controller.enqueue({
          type: 'stream-start',
          warnings: result.warnings,
        });

        controller.enqueue({
          type: 'response-metadata',
          modelId: result.response?.modelId,
          timestamp: result.response?.timestamp,
        });

        for (const part of result.content) {
          if (part.type === 'text') {
            const id = generateId();
            controller.enqueue({ type: 'text-start', id });
            controller.enqueue({
              type: 'text-delta',
              id,
              delta: part.text,
            });
            controller.enqueue({ type: 'text-end', id });
          } else if (part.type === 'file') {
            controller.enqueue({
              type: 'file',
              mediaType: part.mediaType,
              data: part.data,
            });
          }
        }

        controller.enqueue({
          type: 'finish',
          usage: result.usage,
          finishReason: result.finishReason,
          providerMetadata: result.providerMetadata,
        });

        controller.close();
      },
    });

    return {
      stream,
      response: {
        headers: result.response?.headers,
      },
    };
  }
}

export const prodiaLanguageModelOptionsSchema = lazySchema(() =>
  zodSchema(
    z.object({
      aspectRatio: z
        .enum([
          '1:1',
          '2:3',
          '3:2',
          '4:5',
          '5:4',
          '4:7',
          '7:4',
          '9:16',
          '16:9',
          '9:21',
          '21:9',
        ])
        .optional(),
    }),
  ),
);

export type ProdiaLanguageModelOptions = InferSchema<
  typeof prodiaLanguageModelOptionsSchema
>;

interface LanguageMultipartResult {
  jobResult: ProdiaJobResult;
  textContent: string | undefined;
  fileContent: Array<{ mediaType: string; data: Uint8Array }>;
}

function createLanguageMultipartResponseHandler() {
  return async ({
    response,
  }: {
    response: Response;
  }): Promise<{
    value: LanguageMultipartResult;
    responseHeaders: Record<string, string>;
  }> => {
    const contentType = response.headers.get('content-type') ?? '';
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    const boundaryMatch = contentType.match(/boundary=([^\s;]+)/);
    if (!boundaryMatch) {
      throw new Error(
        `Prodia response missing multipart boundary in content-type: ${contentType}`,
      );
    }
    const boundary = boundaryMatch[1];

    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    const parts = parseMultipart(bytes, boundary);

    let jobResult: ProdiaJobResult | undefined;
    let textContent: string | undefined;
    const fileContent: Array<{ mediaType: string; data: Uint8Array }> = [];

    for (const part of parts) {
      const contentDisposition = part.headers['content-disposition'] ?? '';
      const partContentType = part.headers['content-type'] ?? '';

      if (contentDisposition.includes('name="job"')) {
        const jsonStr = new TextDecoder().decode(part.body);
        jobResult = await parseJSON({
          text: jsonStr,
          schema: zodSchema(prodiaJobResultSchema),
        });
      } else if (contentDisposition.includes('name="output"')) {
        if (
          partContentType.startsWith('text/') ||
          contentDisposition.includes('.txt')
        ) {
          textContent = new TextDecoder().decode(part.body);
        } else if (partContentType.startsWith('image/')) {
          fileContent.push({
            mediaType: partContentType,
            data: part.body,
          });
        }
      }
    }

    if (!jobResult) {
      throw new Error('Prodia multipart response missing job part');
    }

    return {
      value: { jobResult, textContent, fileContent },
      responseHeaders,
    };
  };
}
