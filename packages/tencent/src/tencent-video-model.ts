import {
  AISDKError,
  NoSuchModelError,
  type Experimental_VideoModelV3 as VideoModelV3,
  type Experimental_VideoModelV3CallOptions as VideoModelV3CallOptions,
  type SharedV3Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  delay,
  encodePathSegment,
  type FetchFunction,
  getFromApi,
  parseProviderOptions,
  postJsonToApi,
  type Resolvable,
  resolve,
} from '@ai-sdk/provider-utils';
import {
  postTencentCloudApi,
  type TencentCloudCredentials,
} from './tencent-cloud-api';
import {
  createTencentTokenHubResponseHandler,
  tencentTokenHubFailedResponseHandler,
} from './tencent-tokenhub-error';
import {
  buildTokenHubKlingRequest,
  interpretTokenHubKlingStatus,
  tokenHubKlingCreateResponseSchema,
  tokenHubKlingStatusResponseSchema,
} from './tencent-tokenhub-video';
import {
  warnIgnoredProviderOptions,
  warnUnsupportedCommonOptions,
} from './tencent-video-inputs';
import {
  TOKENHUB_ONLY_OPTIONS,
  tencentVideoModelOptionsSchema,
  type TencentVideoModelOptions,
  VOD_ONLY_OPTIONS,
} from './tencent-video-model-options';
import {
  type ParsedTencentVideoModelId,
  parseTencentVideoModelId,
  type TencentVideoModelId,
} from './tencent-video-settings';
import type { TencentVideoTaskStatus } from './tencent-video-task-status';
import {
  buildVodCreateTaskBody,
  interpretVodTaskDetail,
  TENCENT_VOD_SERVICE,
  TENCENT_VOD_VERSION,
  vodCreateTaskResponseSchema,
  vodDescribeTaskDetailResponseSchema,
} from './tencent-vod-video';

export type TencentVodCredentials = TencentCloudCredentials & {
  subAppId: number;
};

export interface TencentVideoModelConfig {
  provider: string;
  tokenHub: {
    baseURL: string;
    headers?: Resolvable<Record<string, string | undefined>>;
  };
  vod: {
    baseURL: string;
    region?: string;
    /** Resolved when a VOD request is made, so TokenHub-only use needs no VOD credentials. */
    credentials: () => TencentVodCredentials;
    headers?: Resolvable<Record<string, string | undefined>>;
  };
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
}

type DoGenerateResult = Awaited<ReturnType<VideoModelV3['doGenerate']>>;

export class TencentVideoModel implements VideoModelV3 {
  readonly specificationVersion = 'v3';
  readonly maxVideosPerCall = 1;

  private readonly parsedModelId: ParsedTencentVideoModelId;

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: TencentVideoModelId,
    private readonly config: TencentVideoModelConfig,
  ) {
    const parsed = parseTencentVideoModelId(modelId);
    if (parsed == null) {
      throw new NoSuchModelError({ modelId, modelType: 'videoModel' });
    }
    this.parsedModelId = parsed;
  }

  private currentDate(): Date {
    return this.config._internal?.currentDate?.() ?? new Date();
  }

  async doGenerate(
    options: VideoModelV3CallOptions,
  ): Promise<DoGenerateResult> {
    const { taskId, tencentOptions, warnings } = await this.startTask(options);

    const pollIntervalMs = tencentOptions?.pollIntervalMs ?? 5000; // 5 seconds
    const pollTimeoutMs = tencentOptions?.pollTimeoutMs ?? 600000; // 10 minutes
    const startTime = Date.now();

    while (true) {
      await delay(pollIntervalMs, { abortSignal: options.abortSignal });

      if (Date.now() - startTime > pollTimeoutMs) {
        throw new AISDKError({
          name: 'TENCENT_VIDEO_GENERATION_TIMEOUT',
          message: `Video generation timed out after ${pollTimeoutMs}ms (task ${taskId})`,
        });
      }

      const status = await this.getTaskStatus({
        taskId,
        headers: options.headers,
        abortSignal: options.abortSignal,
      });

      if (status.status === 'completed') {
        return {
          videos: status.videos,
          warnings: [...warnings, ...status.warnings],
          providerMetadata: status.providerMetadata,
          response: status.response,
        };
      }

      if (status.status === 'error') {
        throw new AISDKError({
          name: 'TENCENT_VIDEO_GENERATION_FAILED',
          message: status.error,
        });
      }
    }
  }

  private async startTask(options: VideoModelV3CallOptions): Promise<{
    taskId: string;
    tencentOptions: TencentVideoModelOptions | undefined;
    warnings: SharedV3Warning[];
  }> {
    const currentDate = this.currentDate();
    const warnings: SharedV3Warning[] = [];
    const parsed = this.parsedModelId;

    const tencentOptions = (await parseProviderOptions({
      provider: 'tencent',
      providerOptions: options.providerOptions,
      schema: tencentVideoModelOptionsSchema,
    })) as TencentVideoModelOptions | undefined;

    warnUnsupportedCommonOptions({
      options,
      supportsSeed: parsed.backend === 'vod',
      warnings,
    });

    let taskId: string;

    if (parsed.backend === 'tokenhub') {
      warnIgnoredProviderOptions({
        tencentOptions,
        keys: VOD_ONLY_OPTIONS,
        details: 'This option only applies to VOD models; it was ignored.',
        warnings,
      });

      const { endpoint, body } = buildTokenHubKlingRequest({
        modelId: this.modelId,
        kind: parsed.kind,
        options,
        tencentOptions,
        warnings,
      });

      const result = await postJsonToApi({
        url: `${this.config.tokenHub.baseURL}/wand/kling/${endpoint}`,
        headers: combineHeaders(
          await resolve(this.config.tokenHub.headers),
          options.headers,
        ),
        body,
        successfulResponseHandler: createTencentTokenHubResponseHandler(
          tokenHubKlingCreateResponseSchema,
        ),
        failedResponseHandler: tencentTokenHubFailedResponseHandler,
        abortSignal: options.abortSignal,
        fetch: this.config.fetch,
      });

      const id = result.value.data?.id;
      if (!id) {
        throw new AISDKError({
          name: 'TENCENT_VIDEO_GENERATION_ERROR',
          message: 'No task ID returned from TokenHub.',
        });
      }
      taskId = id;
    } else {
      warnIgnoredProviderOptions({
        tencentOptions,
        keys: TOKENHUB_ONLY_OPTIONS,
        details:
          'This option only applies to TokenHub Kling models; it was ignored.',
        warnings,
      });

      const credentials = this.config.vod.credentials();

      const result = await postTencentCloudApi({
        url: this.config.vod.baseURL,
        service: TENCENT_VOD_SERVICE,
        action: 'CreateAigcVideoTask',
        version: TENCENT_VOD_VERSION,
        region: this.config.vod.region,
        credentials,
        body: buildVodCreateTaskBody({
          modelName: parsed.modelName,
          modelVersion: parsed.modelVersion,
          subAppId: credentials.subAppId,
          options,
          tencentOptions,
          warnings,
        }),
        responseSchema: vodCreateTaskResponseSchema,
        headers: combineHeaders(
          await resolve(this.config.vod.headers),
          options.headers,
        ),
        timestamp: Math.floor(currentDate.getTime() / 1000),
        abortSignal: options.abortSignal,
        fetch: this.config.fetch,
      });

      taskId = result.value.TaskId;
    }

    return { taskId, tencentOptions, warnings };
  }

  private async getTaskStatus(options: {
    taskId: string;
    headers: Record<string, string | undefined> | undefined;
    abortSignal: AbortSignal | undefined;
  }): Promise<TencentVideoTaskStatus> {
    const currentDate = this.currentDate();
    const { taskId } = options;

    if (this.parsedModelId.backend === 'tokenhub') {
      const baseURL = this.config.tokenHub.baseURL;
      const { value, responseHeaders } = await getFromApi({
        url: `${baseURL}/wand/kling/tasks/${encodePathSegment(taskId)}`,
        validateUrl: true,
        trustedOrigin: baseURL,
        headers: combineHeaders(
          await resolve(this.config.tokenHub.headers),
          options.headers,
        ),
        successfulResponseHandler: createTencentTokenHubResponseHandler(
          tokenHubKlingStatusResponseSchema,
        ),
        failedResponseHandler: tencentTokenHubFailedResponseHandler,
        abortSignal: options.abortSignal,
        fetch: this.config.fetch,
      });

      return interpretTokenHubKlingStatus({
        statusResponse: value,
        taskId,
        response: {
          timestamp: currentDate,
          modelId: this.modelId,
          headers: responseHeaders,
        },
      });
    }

    const credentials = this.config.vod.credentials();

    const { value, responseHeaders } = await postTencentCloudApi({
      url: this.config.vod.baseURL,
      service: TENCENT_VOD_SERVICE,
      action: 'DescribeTaskDetail',
      version: TENCENT_VOD_VERSION,
      region: this.config.vod.region,
      credentials,
      body: { TaskId: taskId, SubAppId: credentials.subAppId },
      responseSchema: vodDescribeTaskDetailResponseSchema,
      headers: combineHeaders(
        await resolve(this.config.vod.headers),
        options.headers,
      ),
      timestamp: Math.floor(currentDate.getTime() / 1000),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    return interpretVodTaskDetail({
      detail: value,
      taskId,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
      },
    });
  }
}
