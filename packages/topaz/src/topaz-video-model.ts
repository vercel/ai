import {
  AISDKError,
  APICallError,
  InvalidArgumentError,
  InvalidResponseDataError,
  type Experimental_VideoModelV3 as VideoModelV3,
  type Experimental_VideoModelV3File as VideoModelV3File,
  type SharedV3Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  createJsonResponseHandler,
  delay,
  isSameOrigin,
  parseProviderOptions,
  postJsonToApi,
  removeUndefinedEntries,
  resolve,
  validateDownloadUrl,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { TopazConfig } from './topaz-config';
import { topazFailedResponseHandler } from './topaz-error';
import { topazGetFromApi } from './topaz-get-from-api';
import {
  TOPAZ_NON_FILTER_OPTION_KEYS,
  type topazOutputContainers,
  topazSourceContainers,
  topazVideoModelOptionsSchema,
  type TopazVideoModelOptions,
} from './topaz-video-model-options';
import {
  resolveTopazVideoApiModelId,
  type TopazVideoModelId,
} from './topaz-video-settings';
import { VERSION } from './version';

type VideoModelResult = Awaited<ReturnType<VideoModelV3['doGenerate']>>;
type TopazVideoOperation = { requestId: string; outputContainer: string };

const DEFAULT_POLL_INTERVAL_MILLIS = 2000;
const DEFAULT_POLL_TIMEOUT_MILLIS = 3_600_000;

type TopazSourceContainer = (typeof topazSourceContainers)[number];
type TopazOutputContainer = (typeof topazOutputContainers)[number];

const mediaTypeContainers: Record<string, TopazSourceContainer> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/mov': 'mov',
  'video/x-matroska': 'mkv',
  'video/matroska': 'mkv',
  'video/webm': 'webm',
  'video/x-msvideo': 'avi',
  'video/avi': 'avi',
  'video/mpeg': 'mpeg',
  'video/mp2t': 'ts',
  'video/x-ms-wmv': 'wmv',
  'video/x-flv': 'flv',
  'video/3gpp': '3gp',
  'video/x-m4v': 'm4v',
  'application/mxf': 'mxf',
};

const extensionContainers: Record<string, TopazSourceContainer> = {
  ...Object.fromEntries(topazSourceContainers.map(c => [c, c])),
  qt: 'mov',
};

const containerMediaTypes: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  webm: 'video/webm',
  avi: 'video/x-msvideo',
  mpeg: 'video/mpeg',
  mpg: 'video/mpeg',
  ts: 'video/mp2t',
  wmv: 'video/x-ms-wmv',
  flv: 'video/x-flv',
  '3gp': 'video/3gpp',
  mxf: 'application/mxf',
};

/**
 * Topaz video models enhance a video the caller supplies, passed through
 * `inputReferences`. `doGenerate` creates an express request: Topaz fetches URL
 * inputs itself, and file inputs are uploaded to the returned URL. Processing
 * starts once Topaz has the video, and the provider polls until it completes.
 */
export class TopazVideoModel implements VideoModelV3 {
  readonly specificationVersion = 'v3';
  readonly maxVideosPerCall = 1;

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: TopazVideoModelId,
    private readonly config: TopazConfig,
  ) {}

  async doGenerate(
    options: Parameters<VideoModelV3['doGenerate']>[0],
  ): Promise<VideoModelResult> {
    const topazOptions = await parseProviderOptions({
      provider: 'topaz',
      providerOptions: options.providerOptions,
      schema: topazVideoModelOptionsSchema,
    });
    const started = await this.start(options);
    const pollIntervalMillis =
      topazOptions?.pollIntervalMillis ?? DEFAULT_POLL_INTERVAL_MILLIS;
    const pollTimeoutMillis =
      topazOptions?.pollTimeoutMillis ?? DEFAULT_POLL_TIMEOUT_MILLIS;
    const deadline = Date.now() + pollTimeoutMillis;

    try {
      while (true) {
        const result = await this.getStatus({
          operation: started.operation,
          headers: options.headers,
          abortSignal: options.abortSignal,
        });
        if (result != null) {
          return {
            ...result,
            warnings: [...started.warnings, ...result.warnings],
            response: {
              ...result.response,
              timestamp: started.response.timestamp,
            },
          };
        }

        if (Date.now() + pollIntervalMillis > deadline) {
          const headers = combineHeaders(
            await resolve(this.config.headers),
            options.headers,
          );
          await this.cancelQuietly(started.operation.requestId, headers);
          throw new AISDKError({
            name: 'TOPAZ_VIDEO_ENHANCEMENT_TIMEOUT',
            message:
              `Topaz video enhancement did not finish within ${pollTimeoutMillis}ms ` +
              `(request ${started.operation.requestId}). ` +
              'Increase the `pollTimeoutMillis` provider option if the job needs longer.',
          });
        }
        await delay(pollIntervalMillis, { abortSignal: options.abortSignal });
      }
    } catch (error) {
      if (options.abortSignal?.aborted) {
        const headers = combineHeaders(
          await resolve(this.config.headers),
          options.headers,
        );
        await this.cancelQuietly(started.operation.requestId, headers);
      }
      throw error;
    }
  }

  private async start(
    options: Parameters<VideoModelV3['doGenerate']>[0],
  ): Promise<
    Omit<VideoModelResult, 'videos'> & { operation: TopazVideoOperation }
  > {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const warnings: SharedV3Warning[] = [];

    const topazOptions = await parseProviderOptions({
      provider: 'topaz',
      providerOptions: options.providerOptions,
      schema: topazVideoModelOptionsSchema,
    });
    const headers = combineHeaders(
      await resolve(this.config.headers),
      options.headers,
    );

    this.addUnsupportedWarnings(options, warnings);

    const input = this.selectInputVideo(options, warnings);
    const container = resolveContainer(input, topazOptions?.source?.container);
    const source = resolveSource(topazOptions, container);
    const output = buildOutput({ options, topazOptions, source });
    const filters = [
      buildFilter(this.modelId, topazOptions),
      ...(topazOptions?.additionalFilters ?? []),
    ];
    const contentType =
      containerMediaTypes[source.container] ?? 'application/octet-stream';

    const metadata = source.metadata;
    const bytes = input.type === 'file' ? fileBytes(input) : undefined;
    let requestId: string | undefined;

    try {
      const { value: created, responseHeaders } = await postJsonToApi({
        url: `${this.config.baseURL}/video/express`,
        headers,
        body: {
          source: {
            container: source.container,
            ...(metadata != null
              ? {
                  duration: metadata.duration,
                  frameCount: metadata.frameCount,
                  frameRate: metadata.frameRate,
                  resolution: {
                    width: metadata.width,
                    height: metadata.height,
                  },
                }
              : {}),
            ...(input.type === 'url'
              ? // Topaz fetches URL inputs itself, so, like other providers,
                // the SDK never downloads them.
                { external: { provider: 's3', presignedUrl: input.url } }
              : { size: bytes?.byteLength }),
          },
          output,
          filters,
        },
        successfulResponseHandler: createJsonResponseHandler(
          topazVideoExpressResponseSchema,
        ),
        failedResponseHandler: topazFailedResponseHandler,
        abortSignal: options.abortSignal,
        fetch: this.config.fetch,
      });

      requestId = requireRequestId(created.requestId);

      if (bytes != null) {
        await this.uploadVideo({
          requestId,
          bytes,
          urls: created.uploadUrls,
          contentType,
          abortSignal: options.abortSignal,
        });
      }

      return {
        // The output container travels with the operation so the polling code can
        // report the right media type without re-deriving it.
        operation: { requestId, outputContainer: output.container },
        warnings,
        providerMetadata: {
          topaz: {
            requestId,
            // Preliminary: Topaz estimates up front only when it gets source
            // metadata, and the completed status carries the billed value.
            ...(created.estimates?.cost != null
              ? { estimatedCredits: created.estimates.cost }
              : {}),
          },
        },
        response: {
          timestamp: currentDate,
          modelId: this.modelId,
          headers: responseHeaders,
        },
      };
    } catch (error) {
      // Canceling before processing starts refunds any reserved credits.
      if (requestId != null) {
        await this.cancelQuietly(requestId, headers);
      }
      throw error;
    }
  }

  private async getStatus(options: {
    operation: TopazVideoOperation;
    headers?: Record<string, string | undefined>;
    abortSignal?: AbortSignal;
  }): Promise<VideoModelResult | undefined> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { requestId, outputContainer } = options.operation as {
      requestId: string;
      outputContainer?: string;
    };

    const { value: status, responseHeaders } = await topazGetFromApi({
      url: `${this.config.baseURL}/video/${requestId}/status`,
      // Built from the configured baseURL, not from response data.
      validateUrl: false,
      headers: combineHeaders(
        await resolve(this.config.headers),
        options.headers,
      ),
      successfulResponseHandler: createJsonResponseHandler(
        topazVideoStatusResponseSchema,
      ),
      failedResponseHandler: topazFailedResponseHandler,
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const response = {
      timestamp: currentDate,
      modelId: this.modelId,
      headers: responseHeaders,
    };

    if (status.status === 'complete') {
      // Topaz confirmed it invoices the lower bound of `estimates.cost`, which
      // it recomputes once the source upload has been received.
      const credits = lowerBoundCredits(status.estimates?.cost);

      const url = status.download?.url;
      if (url == null) {
        throw new InvalidResponseDataError({
          data: status,
          message: `Topaz reported request ${requestId} complete but returned no download URL.`,
        });
      }

      return {
        videos: [
          {
            type: 'url',
            url,
            mediaType:
              (outputContainer != null
                ? containerMediaTypes[outputContainer]
                : undefined) ?? 'video/mp4',
          },
        ],
        warnings: [],
        response,
        providerMetadata: {
          topaz: {
            requestId,
            ...(credits != null ? { credits } : {}),
            ...(status.estimates?.cost != null
              ? { estimatedCredits: status.estimates.cost }
              : {}),
            ...(status.outputSize != null
              ? { outputSize: status.outputSize }
              : {}),
            ...(status.download?.expiresAt != null
              ? { expiresAt: status.download.expiresAt }
              : {}),
          },
        },
      };
    }

    if (status.status === 'failed' || status.status === 'canceled') {
      throw new AISDKError({
        name: 'TOPAZ_VIDEO_ENHANCEMENT_FAILED',
        message:
          `Topaz video request ${requestId} ${status.status}` +
          (status.errorCode != null ? ` (${status.errorCode})` : '') +
          (status.message != null ? `: ${status.message}` : '.'),
      });
    }

    // Documented in-progress values are requested, accepted, initializing,
    // preprocessing, processing, postprocessing and canceling. Anything else
    // keeps polling too, so a newly added state cannot break running jobs.
    return undefined;
  }

  private addUnsupportedWarnings(
    options: Parameters<VideoModelV3['doGenerate']>[0],
    warnings: SharedV3Warning[],
  ): void {
    // `generateVideo` requires a prompt, so an empty one is the expected way
    // to call an enhancement model and does not warrant a warning.
    if (options.prompt != null && options.prompt.trim() !== '') {
      warnings.push({
        type: 'unsupported',
        feature: 'prompt',
        details:
          'Topaz video models enhance an existing video and do not take a text prompt. ' +
          'The prompt was ignored.',
      });
    }

    if (options.aspectRatio != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'aspectRatio',
        details:
          'Topaz video models do not support aspectRatio. Use `resolution`, or the ' +
          '`output` provider option, to set the output dimensions.',
      });
    }

    if (options.seed != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'seed',
        details: 'Topaz video models do not support seed.',
      });
    }

    if (options.duration != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'duration',
        details:
          'Topaz video models enhance the whole input video, so duration was ignored. ' +
          'Pass the input duration via the `source.duration` provider option instead.',
      });
    }

    if (options.generateAudio != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'generateAudio',
        details:
          'Topaz video models do not generate audio. Use the `output.audioTransfer` ' +
          'provider option to control how the input audio track is carried over.',
      });
    }

    if (options.frameImages != null && options.frameImages.length > 0) {
      warnings.push({
        type: 'unsupported',
        feature: 'frameImages',
        details:
          'Topaz video models do not support first/last frame generation. The frame ' +
          'images were ignored.',
      });
    }

    if (options.n > 1) {
      warnings.push({
        type: 'unsupported',
        feature: 'n',
        details:
          'Topaz video models enhance one video per call. Only 1 video will be produced.',
      });
    }
  }

  private selectInputVideo(
    options: Parameters<VideoModelV3['doGenerate']>[0],
    warnings: SharedV3Warning[],
  ): VideoModelV3File {
    const references = options.inputReferences ?? [];
    const videos = references.filter(isVideoReference);

    if (videos.length === 0) {
      if (options.image != null) {
        throw new InvalidArgumentError({
          argument: 'image',
          message:
            'Topaz video models enhance an existing video, not a still image. Pass the ' +
            'input video via `inputReferences`.',
        });
      }

      throw new InvalidArgumentError({
        argument: 'inputReferences',
        message:
          'Topaz video models require an input video. Pass it via `inputReferences`, ' +
          'e.g. `inputReferences: [{ type: "file", mediaType: "video/mp4", data: bytes }]`. ' +
          'For URL references, include `mediaType` so the reference is recognized as a video.',
      });
    }

    if (references.length > 1) {
      warnings.push({
        type: 'unsupported',
        feature: 'inputReferences',
        details:
          'Topaz video models enhance a single video. Only the first video reference was used.',
      });
    }

    return videos[0];
  }

  private async uploadVideo({
    requestId,
    bytes,
    urls,
    contentType,
    abortSignal,
  }: {
    requestId: string;
    bytes: Uint8Array;
    urls: string[] | null | undefined;
    contentType: string;
    abortSignal: AbortSignal | undefined;
  }): Promise<void> {
    const url = urls?.[0];
    if (url == null) {
      throw new InvalidResponseDataError({
        data: urls,
        message: `Topaz returned no upload URL for request ${requestId}.`,
      });
    }

    // The upload URL comes from the Topaz response body. `getFromApi` cannot
    // be used for a PUT, so the same trust decision is made explicitly here:
    // validate unless the URL points back at the configured base URL, and
    // never attach the API key (presigned URLs carry their own credentials).
    if (!isSameOrigin(url, this.config.baseURL)) {
      validateDownloadUrl(url);
    }

    const fetchImpl = this.config.fetch ?? globalThis.fetch;
    const response = await fetchImpl(url, {
      method: 'PUT',
      headers: withUserAgentSuffix(
        { 'Content-Type': contentType },
        `ai-sdk-topaz/${VERSION}`,
      ) as HeadersInit,
      body: bytes as BodyInit,
      signal: abortSignal,
    });

    if (!response.ok) {
      throw new APICallError({
        message: `Uploading the input video failed with status ${response.status}.`,
        url,
        requestBodyValues: {},
        statusCode: response.status,
        responseHeaders: Object.fromEntries(response.headers.entries()),
        responseBody: await response.text(),
      });
    }
  }

  private async cancelQuietly(
    requestId: string,
    headers: Record<string, string | undefined>,
  ): Promise<void> {
    const fetchImpl = this.config.fetch ?? globalThis.fetch;

    try {
      // Deliberately not tied to the caller's abort signal, which may be the
      // reason the start failed.
      await fetchImpl(`${this.config.baseURL}/video/${requestId}`, {
        method: 'DELETE',
        headers: removeUndefinedEntries(headers),
      });
    } catch {
      // Best effort: the original error is more useful to the caller.
    }
  }
}

function lowerBoundCredits(
  cost: number[] | null | undefined,
): number | undefined {
  return cost != null && cost.length > 0 ? Math.min(...cost) : undefined;
}

function fileBytes(
  input: Extract<VideoModelV3File, { type: 'file' }>,
): Uint8Array {
  return typeof input.data === 'string'
    ? convertBase64ToUint8Array(input.data)
    : input.data;
}

function resolveContainer(
  input: VideoModelV3File,
  declaredContainer: TopazSourceContainer | undefined,
): TopazSourceContainer {
  if (declaredContainer != null) {
    return declaredContainer;
  }

  if (input.type === 'file') {
    const container = mediaTypeContainers[input.mediaType.toLowerCase()];

    if (container == null) {
      throw new InvalidArgumentError({
        argument: 'inputReferences',
        message:
          `Could not map the media type "${input.mediaType}" onto a Topaz container. ` +
          'Set the `source.container` provider option explicitly.',
      });
    }

    return container;
  }

  const container =
    (input.mediaType != null
      ? mediaTypeContainers[input.mediaType.toLowerCase()]
      : undefined) ?? containerFromUrl(input.url);

  if (container == null) {
    throw new InvalidArgumentError({
      argument: 'inputReferences',
      message:
        `Could not determine the container of the input video at "${input.url}". Set ` +
        'the `source.container` provider option, or pass `mediaType` on the reference.',
    });
  }

  return container;
}

function isVideoReference(reference: VideoModelV3File): boolean {
  if (reference.type === 'file') {
    return reference.mediaType.toLowerCase().startsWith('video/');
  }

  if (reference.mediaType != null) {
    return reference.mediaType.toLowerCase().startsWith('video/');
  }

  return containerFromUrl(reference.url) != null;
}

function containerFromUrl(url: string): TopazSourceContainer | undefined {
  const withoutQuery = url.split(/[?#]/)[0];
  const extension = withoutQuery.split('.').pop()?.toLowerCase();
  return extension != null ? extensionContainers[extension] : undefined;
}

type SourceMetadata = {
  duration: number;
  frameRate: number;
  frameCount: number;
  width: number;
  height: number;
};

type ResolvedSource = {
  container: TopazSourceContainer;
  metadata: SourceMetadata | undefined;
};

/**
 * Reads the optional source metadata, which is all or nothing. Starlight
 * models require it, and it lets Topaz estimate the cost up front. Nothing is
 * read out of the video bytes: no provider package inspects media files.
 */
function resolveSource(
  topazOptions: TopazVideoModelOptions | undefined,
  container: TopazSourceContainer,
): ResolvedSource {
  const source = topazOptions?.source;
  const { width, height, duration, frameRate } = source ?? {};

  if (
    width == null &&
    height == null &&
    duration == null &&
    frameRate == null &&
    source?.frameCount == null
  ) {
    return { container, metadata: undefined };
  }

  const frameCount =
    source?.frameCount ??
    (duration != null && frameRate != null
      ? Math.round(duration * frameRate)
      : undefined);

  const missing = [
    width == null ? 'source.width' : undefined,
    height == null ? 'source.height' : undefined,
    duration == null ? 'source.duration' : undefined,
    frameRate == null ? 'source.frameRate' : undefined,
  ].filter(field => field != null);

  if (
    width == null ||
    height == null ||
    duration == null ||
    frameRate == null ||
    frameCount == null
  ) {
    throw new InvalidArgumentError({
      argument: 'providerOptions.topaz.source',
      message: `Source metadata must be complete. Missing: ${missing.join(', ')}.`,
    });
  }

  return {
    container,
    metadata: { duration, frameRate, frameCount, width, height },
  };
}

function parseResolution(resolution: `${number}x${number}` | undefined): {
  width: number | undefined;
  height: number | undefined;
} {
  if (resolution == null) {
    return { width: undefined, height: undefined };
  }

  const [width, height] = resolution.split('x').map(Number);
  return { width, height };
}

function buildOutput({
  options,
  topazOptions,
  source,
}: {
  options: Parameters<VideoModelV3['doGenerate']>[0];
  topazOptions: TopazVideoModelOptions | undefined;
  source: ResolvedSource;
}): Record<string, unknown> & { container: TopazOutputContainer } {
  const output = topazOptions?.output;
  const resolution = parseResolution(options.resolution);

  const width = output?.width ?? resolution.width ?? source.metadata?.width;
  const height = output?.height ?? resolution.height ?? source.metadata?.height;

  if (width == null || height == null) {
    throw new InvalidArgumentError({
      argument: 'resolution',
      message:
        'Topaz needs the output resolution. Set the `resolution` call option or the ' +
        '`output.width` / `output.height` provider options.',
    });
  }

  const frameRate =
    output?.frameRate ?? options.fps ?? source.metadata?.frameRate;
  const audioTransfer = output?.audioTransfer ?? 'Copy';

  return {
    resolution: { width, height },
    ...(frameRate != null ? { frameRate } : {}),
    audioTransfer,
    ...(audioTransfer !== 'None'
      ? { audioCodec: output?.audioCodec ?? 'AAC' }
      : output?.audioCodec != null
        ? { audioCodec: output.audioCodec }
        : {}),
    ...(output?.audioBitrate != null
      ? { audioBitrate: output.audioBitrate }
      : {}),
    ...(output?.videoEncoder != null
      ? { videoEncoder: output.videoEncoder }
      : {}),
    ...(output?.videoProfile != null
      ? { videoProfile: output.videoProfile }
      : {}),
    ...(output?.videoBitrate != null
      ? { videoBitrate: output.videoBitrate }
      : {}),
    ...(output?.dynamicCompressionLevel != null
      ? { dynamicCompressionLevel: output.dynamicCompressionLevel }
      : {}),
    ...(output?.cropToFit != null ? { cropToFit: output.cropToFit } : {}),
    container: resolveOutputContainer(output, source.container),
  };
}

/**
 * Mirrors Topaz's container rules so the polling code can report the media type of
 * the file Topaz will actually produce.
 */
function resolveOutputContainer(
  output: TopazVideoModelOptions['output'],
  sourceContainer: TopazSourceContainer,
): TopazOutputContainer {
  switch (output?.videoEncoder) {
    case 'ProRes':
      return 'mov';
    case 'AV1':
    case 'VP9':
      return 'mp4';
  }

  if (output?.container != null) {
    return output.container;
  }

  // The default H265 encoder only writes mp4, mov and mkv.
  return sourceContainer === 'mov' || sourceContainer === 'mkv'
    ? sourceContainer
    : 'mp4';
}

function requireRequestId(requestId: string | null | undefined): string {
  if (requestId == null) {
    throw new InvalidResponseDataError({
      data: requestId,
      message: 'Topaz did not return a requestId for the video request.',
    });
  }

  return requestId;
}

function buildFilter(
  modelId: string,
  topazOptions: TopazVideoModelOptions | undefined,
): Record<string, unknown> {
  const filter: Record<string, unknown> = {
    model: resolveTopazVideoApiModelId(modelId),
  };

  if (topazOptions != null) {
    const nonFilterKeys = new Set<string>(TOPAZ_NON_FILTER_OPTION_KEYS);

    for (const [key, value] of Object.entries(topazOptions)) {
      if (!nonFilterKeys.has(key) && value !== undefined) {
        filter[key] = value;
      }
    }

    Object.assign(filter, topazOptions.filter ?? {});
  }

  return filter;
}

// `cost` (credits) and `time` (seconds) are [lowerBound, upperBound] pairs.
const topazVideoEstimatesSchema = z
  .object({
    cost: z.array(z.number()).nullish(),
    time: z.array(z.number()).nullish(),
  })
  .nullish();

const topazVideoExpressResponseSchema = z.object({
  requestId: z.string().nullish(),
  uploadUrls: z.array(z.string()).nullish(),
  estimates: topazVideoEstimatesSchema,
});

const topazVideoStatusResponseSchema = z.object({
  status: z.string().nullish(),
  message: z.string().nullish(),
  errorCode: z.string().nullish(),
  // Documented as a string, accepted as a number too.
  outputSize: z.union([z.string(), z.number()]).nullish(),
  estimates: topazVideoEstimatesSchema,
  download: z
    .object({
      url: z.string().nullish(),
      expiresAt: z.union([z.string(), z.number()]).nullish(),
    })
    .nullish(),
});
