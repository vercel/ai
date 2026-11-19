import { getTencentVideoModelEntry } from './tencent-model-catalog';
import {
  AISDKError,
  NoSuchModelError,
  type Experimental_VideoModelV4 as VideoModelV4,
  type Experimental_VideoModelV4OperationStartResult as VideoModelV4OperationStartResult,
  type Experimental_VideoModelV4OperationStatusResult as VideoModelV4OperationStatusResult,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
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

type DoStartOptions = Parameters<NonNullable<VideoModelV4['doStart']>>[0];
type DoStatusOptions = Parameters<NonNullable<VideoModelV4['doStatus']>>[0];

export class TencentVideoModel implements VideoModelV4 {
  readonly specificationVersion = 'v4';
  readonly maxVideosPerCall = getTencentVideoModelEntry(this.modelId)
    .capabilities.video.maxVideosPerCall;

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

  async doStart(
    options: DoStartOptions,
  ): Promise<VideoModelV4OperationStartResult> {
    const currentDate = this.currentDate();
    const warnings: SharedV4Warning[] = [];
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
    let responseHeaders: Record<string, string> | undefined;

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
      responseHeaders = result.responseHeaders;
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
      responseHeaders = result.responseHeaders;
    }

    return {
      operation: { taskId },
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
      },
    };
  }

  async doStatus(
    options: DoStatusOptions,
  ): Promise<VideoModelV4OperationStatusResult> {
    const currentDate = this.currentDate();
    const { taskId } = options.operation as { taskId: string };

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
