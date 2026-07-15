import {
  AISDKError,
  type Experimental_VideoModelV4,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  delay,
  getFromApi,
  parseProviderOptions,
  postJsonToApi,
  type FetchFunction,
  resolve,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import {
  defaultOpenAICompatibleErrorStructure,
  type ProviderErrorStructure,
} from '../openai-compatible-error';
import { warnIfDeprecatedProviderOptionsKey } from '../utils/to-camel-case';
import {
  openaiCompatibleVideoModelOptionsSchema,
  type OpenAICompatibleVideoModelOptions,
  OpenAICompatibleVideoModelId,
} from './openai-compatible-video-model-options';

export type OpenAICompatibleVideoModelConfig = {
  provider: string;
  headers?: () => Record<string, string | undefined>;
  url: (options: { modelId: string; path: string }) => string;
  fetch?: FetchFunction;
  errorStructure?: ProviderErrorStructure<any>;
  _internal?: {
    currentDate?: () => Date;
  };
};

export class OpenAICompatibleVideoModel implements Experimental_VideoModelV4 {
  readonly specificationVersion = 'v4';
  readonly maxVideosPerCall = 1;

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: OpenAICompatibleVideoModelId,
    private config: OpenAICompatibleVideoModelConfig,
  ) {}

  private get providerOptionsName(): string {
    return this.config.provider.split('.')[0].trim();
  }

  async doGenerate(
    options: Parameters<Experimental_VideoModelV4['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<Experimental_VideoModelV4['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const warnings: SharedV4Warning[] = [];

    // Parse provider options - check for deprecated 'openai-compatible' key
    const deprecatedOptions = (await parseProviderOptions({
      provider: 'openai-compatible',
      providerOptions: options.providerOptions,
      schema: openaiCompatibleVideoModelOptionsSchema,
    })) as OpenAICompatibleVideoModelOptions | undefined;

    if (deprecatedOptions != null) {
      warnings.push({
        type: 'deprecated',
        setting: "providerOptions key 'openai-compatible'",
        message: "Use 'openaiCompatible' instead.",
      });
    }

    // Warn when the raw (non-camelCase) provider name is used
    warnIfDeprecatedProviderOptionsKey({
      rawName: this.providerOptionsName,
      providerOptions: options.providerOptions,
      warnings,
    });

    const compatibleOptions = Object.assign(
      deprecatedOptions ?? {},
      (await parseProviderOptions({
        provider: 'openaiCompatible',
        providerOptions: options.providerOptions,
        schema: openaiCompatibleVideoModelOptionsSchema,
      })) ?? {},
      (await parseProviderOptions({
        provider: this.providerOptionsName,
        providerOptions: options.providerOptions,
        schema: openaiCompatibleVideoModelOptionsSchema,
      })) ?? {},
    );

    if (options.fps != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'fps',
        details: 'OpenAI Compatible video models do not support custom FPS.',
      });
    }

    if (options.seed != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'seed',
        details: 'OpenAI Compatible video models do not support seed.',
      });
    }

    if (options.n != null && options.n > 1) {
      warnings.push({
        type: 'unsupported',
        feature: 'n',
        details:
          'OpenAI Compatible video models do not support generating multiple videos per call. ' +
          'Only 1 video will be generated.',
      });
    }

    const body: Record<string, unknown> = {
      model: this.modelId,
      prompt: options.prompt,
    };

    // Step 1: Create the task
    const { value: createResponse } = await postJsonToApi({
      url: this.config.url({
        path: '/videos/',
        modelId: this.modelId,
      }),
      headers: combineHeaders(
        await resolve(this.config.headers),
        options.headers
      ),
      body,
      failedResponseHandler: createJsonErrorResponseHandler(
        this.config.errorStructure ?? defaultOpenAICompatibleErrorStructure,
      ),
      successfulResponseHandler: createJsonResponseHandler(
        openaiCompatibleTaskResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const taskId = createResponse.id;

    if (!taskId) {
      throw new AISDKError({
        name: 'OPENAI-COMPATIBLE_VIDEO_GENERATION_ERROR',
        message: 'No task ID returned from API',
      });
    }

    // Step 2: Poll for completion
    const pollIntervalMs = deprecatedOptions?.pollIntervalMs ?? 5000; // 5 seconds
    const pollTimeoutMs = deprecatedOptions?.pollTimeoutMs ?? 600000; // 10 minutes
    const startTime = Date.now();
    let response: OpenaiCompatibleResponse;
    let responseHeaders: Record<string, string> | undefined;

    while (true) {
      await delay(pollIntervalMs, { abortSignal: options.abortSignal });

      if (Date.now() - startTime > pollTimeoutMs) {
        throw new AISDKError({
          name: 'OPENAI-COMPATIBLE_VIDEO_GENERATION_TIMEOUT',
          message: `Video generation timed out after ${pollTimeoutMs}ms`,
        });
      }

      const { value: statusResponse, responseHeaders: statusHeaders } =
        await getFromApi({
          url: this.config.url({
            path: '/videos/${taskId}',
            modelId: this.modelId,
          }),
          headers: combineHeaders(await resolve(this.config.headers), options.headers),
          failedResponseHandler: createJsonErrorResponseHandler(
          this.config.errorStructure ?? defaultOpenAICompatibleErrorStructure,
          ),
          successfulResponseHandler: createJsonResponseHandler(
            openaiCompatibleStatusResponseSchema,
        ),
          abortSignal: options.abortSignal,
          fetch: this.config.fetch,
        });

      if (statusResponse.status === 'succeeded') {
        response = statusResponse;
        responseHeaders = statusHeaders;
        break;
      }

      if (statusResponse.status === 'failed') {
        throw new AISDKError({
          name: 'OPENAI-COMPATIBLE_VIDEO_GENERATION_FAILED',
          message: `Video generation failed: ${JSON.stringify(statusResponse)}`,
        });
      }

      // Continue polling for 'submitted' and 'processing' statuses
    }

    const videoUrl = response.url;
    if (!videoUrl) {
      throw new AISDKError({
        name: 'OPENAI-COMPATIBLE_VIDEO_GENERATION_ERROR',
        message: 'No video URL in response',
      });
    }

    return {
      videos: [
        {
          type: 'url',
          url: videoUrl,
          mediaType: 'video/mp4',
        },
      ],
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
      },
    };
  }
}

type OpenaiCompatibleResponse = z.infer<typeof openaiCompatibleStatusResponseSchema>;

const openaiCompatibleTaskResponseSchema = z.object({
  id: z.string().nullish(),
});

const openaiCompatibleStatusResponseSchema = z.object({
  id: z.string().nullish(),
  status: z.string(),
  model: z.string().nullish(),
  progress: z.number().nullish(),
  url: z.string().nullish(),
});
