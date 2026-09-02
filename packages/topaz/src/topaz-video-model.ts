import {
  type Experimental_VideoModelV4 as VideoModelV4,
  type Experimental_VideoModelV4File as VideoModelV4File,
  type Experimental_VideoModelV4OperationStartResult as VideoModelV4OperationStartResult,
  type Experimental_VideoModelV4OperationStatusResult as VideoModelV4OperationStatusResult,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  createBinaryResponseHandler,
  createJsonResponseHandler,
  getFromApi,
  isSameOrigin,
  parseProviderOptions,
  postJsonToApi,
  validateDownloadUrl,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { TopazConfig } from './topaz-config';
import { topazFailedResponseHandler, TopazError } from './topaz-error';
import {
  TOPAZ_NON_FILTER_OPTION_KEYS,
  topazVideoModelOptionsSchema,
  type TopazVideoModelOptions,
} from './topaz-video-model-options';
import {
  resolveTopazVideoApiModelId,
  type TopazVideoModelId,
} from './topaz-video-settings';
import { VERSION } from './version';

type TopazContainer = 'mp4' | 'mov' | 'mkv';

const mediaTypeContainers: Record<string, TopazContainer> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/mov': 'mov',
  'video/x-matroska': 'mkv',
  'video/matroska': 'mkv',
};

const extensionContainers: Record<string, TopazContainer> = {
  mp4: 'mp4',
  m4v: 'mp4',
  mov: 'mov',
  qt: 'mov',
  mkv: 'mkv',
};

const containerMediaTypes: Record<TopazContainer, string> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
};

/** Status values that mean the request has not settled yet. */
const pendingStatuses = new Set([
  'requested',
  'accepted',
  'initializing',
  'preprocessing',
  'processing',
  'postprocessing',
  'canceling',
]);

/**
 * Topaz video models enhance a video the caller supplies. The input video is
 * passed through `inputReferences`, and `doStart` runs the four-step Topaz
 * submission (create, accept, upload, complete-upload) before handing the
 * request id to `doStatus` for polling.
 */
export class TopazVideoModel implements VideoModelV4 {
  readonly specificationVersion = 'v4';
  readonly maxVideosPerCall = 1;

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: TopazVideoModelId,
    private readonly config: TopazConfig,
  ) {}

  async doStart(
    options: Parameters<NonNullable<VideoModelV4['doStart']>>[0],
  ): Promise<VideoModelV4OperationStartResult> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const warnings: SharedV4Warning[] = [];

    const topazOptions = (await parseProviderOptions({
      provider: 'topaz',
      providerOptions: options.providerOptions,
      schema: topazVideoModelOptionsSchema,
    })) as TopazVideoModelOptions | undefined;

    this.addUnsupportedWarnings(options, warnings);

    const input = this.selectInputVideo(options, warnings);
    const { bytes, container } = await this.resolveInput({
      input,
      declaredContainer: topazOptions?.source?.container,
      abortSignal: options.abortSignal,
    });

    const source = resolveSource({
      options,
      topazOptions,
      container,
      sizeBytes: bytes.byteLength,
    });

    const output = buildOutput(source, topazOptions);

    const body = {
      source: {
        container: source.container,
        size: source.size,
        duration: source.duration,
        frameCount: source.frameCount,
        frameRate: source.frameRate,
        resolution: { width: source.width, height: source.height },
      },
      output,
      filters: [
        buildFilter(this.modelId, topazOptions),
        ...(topazOptions?.additionalFilters ?? []),
      ],
    };

    const { value: createResponse, responseHeaders } = await postJsonToApi({
      url: `${this.config.baseURL}/video/`,
      headers: combineHeaders(this.config.headers(), options.headers),
      body,
      successfulResponseHandler: createJsonResponseHandler(
        topazVideoCreateResponseSchema,
      ),
      failedResponseHandler: topazFailedResponseHandler,
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const requestId = createResponse.requestId;
    if (requestId == null) {
      throw new TopazError({
        message: 'Topaz did not return a requestId for the video request.',
      });
    }

    const accepted = await this.patch({
      path: `/video/${requestId}/accept`,
      schema: topazVideoAcceptResponseSchema,
      headers: options.headers,
      abortSignal: options.abortSignal,
    });

    const uploadUrls = accepted.urls ?? [];
    if (uploadUrls.length === 0) {
      throw new TopazError({
        message: `Topaz returned no upload URLs for request ${requestId}.`,
      });
    }

    const uploadResults = await this.uploadVideo({
      bytes,
      urls: uploadUrls,
      contentType: containerMediaTypes[source.container],
      abortSignal: options.abortSignal,
    });

    await this.patch({
      path: `/video/${requestId}/complete-upload`,
      body: { uploadResults },
      schema: topazVideoCompleteUploadResponseSchema,
      headers: options.headers,
      abortSignal: options.abortSignal,
    });

    return {
      // The output container travels with the operation so `doStatus` can
      // report the right media type without re-deriving it.
      operation: { requestId, outputContainer: output.container },
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
      },
    };
  }

  async doStatus(
    options: Parameters<NonNullable<VideoModelV4['doStatus']>>[0],
  ): Promise<VideoModelV4OperationStatusResult> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { requestId, outputContainer } = options.operation as {
      requestId: string;
      outputContainer?: TopazContainer;
    };

    const { value: status, responseHeaders } = await getFromApi({
      url: `${this.config.baseURL}/video/${requestId}/status`,
      // Built from the configured baseURL, not from response data.
      validateUrl: false,
      headers: combineHeaders(this.config.headers(), options.headers),
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
      const url = status.download?.url;
      if (url == null) {
        throw new TopazError({
          message: `Topaz reported request ${requestId} complete but returned no download URL.`,
        });
      }

      return {
        status: 'completed',
        videos: [
          {
            type: 'url',
            url,
            mediaType:
              outputContainer != null
                ? containerMediaTypes[outputContainer]
                : 'video/mp4',
          },
        ],
        warnings: [],
        response,
        providerMetadata: {
          topaz: {
            videos: [
              {
                requestId,
                ...(status.outputSize != null
                  ? { outputSize: status.outputSize }
                  : {}),
                ...(status.download?.expiresAt != null
                  ? { expiresAt: status.download.expiresAt }
                  : {}),
              },
            ],
            ...(status.estimates?.cost != null
              ? { cost: status.estimates.cost }
              : {}),
          },
        },
      };
    }

    if (status.status === 'failed' || status.status === 'canceled') {
      return {
        status: 'error',
        error:
          `Topaz video request ${requestId} ${status.status}` +
          (status.message != null ? `: ${status.message}` : '.'),
        response,
      };
    }

    if (status.status != null && !pendingStatuses.has(status.status)) {
      throw new TopazError({
        message: `Topaz returned an unrecognized status "${status.status}" for request ${requestId}.`,
      });
    }

    return { status: 'pending', response };
  }

  private addUnsupportedWarnings(
    options: Parameters<NonNullable<VideoModelV4['doStart']>>[0],
    warnings: SharedV4Warning[],
  ): void {
    if (options.prompt != null) {
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
    options: Parameters<NonNullable<VideoModelV4['doStart']>>[0],
    warnings: SharedV4Warning[],
  ): VideoModelV4File {
    const references = options.inputReferences ?? [];
    const videos = references.filter(isVideoReference);

    if (videos.length === 0) {
      if (options.image != null) {
        throw new TopazError({
          message:
            'Topaz video models enhance an existing video, not a still image. Pass the ' +
            'input video via `inputReferences`.',
        });
      }

      throw new TopazError({
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

  private async resolveInput({
    input,
    declaredContainer,
    abortSignal,
  }: {
    input: VideoModelV4File;
    declaredContainer: TopazContainer | undefined;
    abortSignal: AbortSignal | undefined;
  }): Promise<{ bytes: Uint8Array; container: TopazContainer }> {
    if (input.type === 'file') {
      const bytes =
        typeof input.data === 'string'
          ? convertBase64ToUint8Array(input.data)
          : input.data;

      const container =
        declaredContainer ?? mediaTypeContainers[input.mediaType.toLowerCase()];

      if (container == null) {
        throw new TopazError({
          message:
            `Topaz does not support the media type "${input.mediaType}". Supported ` +
            'containers are mp4, mov and mkv; set `source.container` explicitly if the ' +
            'media type is unusual.',
        });
      }

      return { bytes, container };
    }

    const container =
      declaredContainer ??
      (input.mediaType != null
        ? mediaTypeContainers[input.mediaType.toLowerCase()]
        : undefined) ??
      containerFromUrl(input.url);

    if (container == null) {
      throw new TopazError({
        message:
          `Could not determine the container of the input video at "${input.url}". Set ` +
          'the `source.container` provider option, or pass `mediaType` on the reference.',
      });
    }

    // Topaz uploads go to presigned object storage, so the bytes have to pass
    // through the SDK even for URL references.
    const { value: bytes } = await getFromApi({
      url: input.url,
      // A caller-supplied URL, so it is validated like any untrusted target.
      validateUrl: true,
      successfulResponseHandler: createBinaryResponseHandler(),
      failedResponseHandler: topazFailedResponseHandler,
      abortSignal,
      fetch: this.config.fetch,
    });

    return { bytes, container };
  }

  private async uploadVideo({
    bytes,
    urls,
    contentType,
    abortSignal,
  }: {
    bytes: Uint8Array;
    urls: string[];
    contentType: string;
    abortSignal: AbortSignal | undefined;
  }): Promise<Array<{ partNum: number; eTag: string }>> {
    const fetchImpl = this.config.fetch ?? globalThis.fetch;
    const partSize = Math.ceil(bytes.byteLength / urls.length);
    const results: Array<{ partNum: number; eTag: string }> = [];

    for (const [index, url] of urls.entries()) {
      // The upload URL comes from the Topaz response body. `getFromApi` cannot
      // be used for a PUT, so the same trust decision is made explicitly here:
      // validate unless the URL points back at the configured base URL, and
      // never attach the API key (presigned URLs carry their own credentials).
      if (!isSameOrigin(url, this.config.baseURL)) {
        validateDownloadUrl(url);
      }

      const part = bytes.subarray(index * partSize, (index + 1) * partSize);

      const response = await fetchImpl(url, {
        method: 'PUT',
        headers: withUserAgentSuffix(
          { 'Content-Type': contentType },
          `ai-sdk/topaz/${VERSION}`,
        ) as HeadersInit,
        body: part as BodyInit,
        signal: abortSignal,
      });

      if (!response.ok) {
        throw new TopazError({
          message:
            `Uploading part ${index + 1} of the input video failed with status ` +
            `${response.status} ${response.statusText}.`,
        });
      }

      const eTag = response.headers.get('etag');
      if (eTag == null) {
        throw new TopazError({
          message: `The upload of part ${index + 1} did not return an ETag header.`,
        });
      }

      results.push({ partNum: index + 1, eTag: eTag.replace(/"/g, '') });
    }

    return results;
  }

  private async patch<T>({
    path,
    body,
    schema,
    headers,
    abortSignal,
  }: {
    path: string;
    body?: unknown;
    schema: z.ZodType<T>;
    headers: Record<string, string | undefined> | undefined;
    abortSignal: AbortSignal | undefined;
  }): Promise<T> {
    // provider-utils only ships GET and POST helpers, so the Topaz PATCH steps
    // are issued directly, reusing the shared error handler for parity.
    const fetchImpl = this.config.fetch ?? globalThis.fetch;
    const url = `${this.config.baseURL}${path}`;

    const response = await fetchImpl(url, {
      method: 'PATCH',
      headers: withUserAgentSuffix(
        combineHeaders(
          this.config.headers(),
          body != null ? { 'Content-Type': 'application/json' } : {},
          headers,
        ),
        `ai-sdk/topaz/${VERSION}`,
      ) as HeadersInit,
      ...(body != null ? { body: JSON.stringify(body) } : {}),
      signal: abortSignal,
    });

    if (!response.ok) {
      const { value: error } = await topazFailedResponseHandler({
        response,
        url,
        requestBodyValues: body ?? {},
      });
      throw error;
    }

    const { value } = await createJsonResponseHandler(schema)({
      response,
      url,
      requestBodyValues: body ?? {},
    });

    return value;
  }
}

function isVideoReference(reference: VideoModelV4File): boolean {
  if (reference.type === 'file') {
    return reference.mediaType.toLowerCase().startsWith('video/');
  }

  if (reference.mediaType != null) {
    return reference.mediaType.toLowerCase().startsWith('video/');
  }

  return containerFromUrl(reference.url) != null;
}

function containerFromUrl(url: string): TopazContainer | undefined {
  const withoutQuery = url.split(/[?#]/)[0];
  const extension = withoutQuery.split('.').pop()?.toLowerCase();
  return extension != null ? extensionContainers[extension] : undefined;
}

type ResolvedSource = {
  container: TopazContainer;
  size: number;
  duration: number;
  frameRate: number;
  frameCount: number;
  width: number;
  height: number;
};

/**
 * Merges the source metadata Topaz needs from the spec call options and the
 * `source` provider option. Nothing is read out of the video bytes: no provider
 * package inspects media files, so anything that cannot be derived from the
 * request has to be supplied by the caller.
 */
function resolveSource({
  options,
  topazOptions,
  container,
  sizeBytes,
}: {
  options: Parameters<NonNullable<VideoModelV4['doStart']>>[0];
  topazOptions: TopazVideoModelOptions | undefined;
  container: TopazContainer;
  sizeBytes: number;
}): ResolvedSource {
  const source = topazOptions?.source;
  const resolution = parseResolution(options.resolution);

  const width = source?.width ?? resolution.width;
  const height = source?.height ?? resolution.height;
  const duration = source?.duration ?? options.duration;
  const frameRate = source?.frameRate ?? options.fps;
  const frameCount =
    source?.frameCount ??
    (duration != null && frameRate != null
      ? Math.round(duration * frameRate)
      : undefined);

  const missing: string[] = [];
  if (width == null || height == null) {
    missing.push('source.width / source.height (or the `resolution` option)');
  }
  if (duration == null) {
    missing.push('source.duration (or the `duration` option)');
  }
  if (frameRate == null) {
    missing.push('source.frameRate (or the `fps` option)');
  }
  if (frameCount == null) {
    missing.push('source.frameCount');
  }

  if (missing.length > 0) {
    throw new TopazError({
      message:
        'Topaz needs metadata about the input video before the upload starts, and the ' +
        'AI SDK does not inspect media files. Missing: ' +
        `${missing.join(', ')}.`,
    });
  }

  return {
    container,
    size: sizeBytes,
    duration: duration!,
    frameRate: frameRate!,
    frameCount: frameCount!,
    width: width!,
    height: height!,
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

function buildOutput(
  source: ResolvedSource,
  topazOptions: TopazVideoModelOptions | undefined,
): {
  container: TopazContainer;
  resolution: { width: number; height: number };
  frameRate: number;
  audioCodec: string;
  audioTransfer: string;
  dynamicCompressionLevel?: string;
} {
  const output = topazOptions?.output;

  return {
    resolution: {
      width: output?.width ?? source.width,
      height: output?.height ?? source.height,
    },
    frameRate: output?.frameRate ?? source.frameRate,
    audioCodec: output?.audioCodec ?? 'AAC',
    audioTransfer: output?.audioTransfer ?? 'Copy',
    container: output?.container ?? source.container,
    ...(output?.dynamicCompressionLevel != null
      ? { dynamicCompressionLevel: output.dynamicCompressionLevel }
      : {}),
  };
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

const topazVideoCreateResponseSchema = z.object({
  requestId: z.string().nullish(),
  estimates: z
    .object({
      cost: z.json().nullish(),
      time: z.json().nullish(),
    })
    .nullish(),
});

const topazVideoAcceptResponseSchema = z.object({
  uploadId: z.string().nullish(),
  urls: z.array(z.string()).nullish(),
  message: z.string().nullish(),
});

const topazVideoCompleteUploadResponseSchema = z.object({
  message: z.string().nullish(),
});

const topazVideoStatusResponseSchema = z.object({
  status: z.string().nullish(),
  progress: z.number().nullish(),
  message: z.string().nullish(),
  outputSize: z.number().nullish(),
  estimates: z
    .object({
      cost: z.json().nullish(),
      time: z.json().nullish(),
    })
    .nullish(),
  download: z
    .object({
      url: z.string().nullish(),
      expiresIn: z.number().nullish(),
      expiresAt: z.union([z.string(), z.number()]).nullish(),
    })
    .nullish(),
});
