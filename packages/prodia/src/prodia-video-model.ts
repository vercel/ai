import {
  InvalidArgumentError,
  type Experimental_VideoModelV4 as VideoModelV4,
  type Experimental_VideoModelV4File as VideoModelV4File,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  downloadBlob,
  parseJSON,
  parseProviderOptions,
  postFormDataToApi,
  postToApi,
  resolve,
  zodSchema,
} from '@ai-sdk/provider-utils';
import {
  buildProdiaProviderMetadata,
  parseMultipart,
  prodiaFailedResponseHandler,
  prodiaJobResultSchema,
  type ProdiaJobResult,
  type ProdiaModelConfig,
} from './prodia-api';
import { prodiaVideoModelOptionsSchema } from './prodia-video-model-options';
import type { ProdiaVideoModelId } from './prodia-video-model-settings';

export class ProdiaVideoModel implements VideoModelV4 {
  readonly specificationVersion = 'v4';
  readonly maxVideosPerCall = 1;

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: ProdiaVideoModelId,
    private readonly config: ProdiaModelConfig,
  ) {}

  async doGenerate(
    options: Parameters<NonNullable<VideoModelV4['doGenerate']>>[0],
  ): Promise<Awaited<ReturnType<NonNullable<VideoModelV4['doGenerate']>>>> {
    const warnings: Array<SharedV4Warning> = [];

    const prodiaOptions = await parseProviderOptions({
      provider: 'prodia',
      providerOptions: options.providerOptions,
      schema: prodiaVideoModelOptionsSchema,
    });

    const jobConfig: Record<string, unknown> = {};

    if (options.prompt !== undefined) {
      jobConfig.prompt = options.prompt;
    }
    if (options.seed !== undefined) {
      jobConfig.seed = options.seed;
    }
    if (prodiaOptions?.resolution !== undefined) {
      jobConfig.resolution = prodiaOptions.resolution;
    }

    const h3Mode = new Map([
      ['inference.minimax.h3.fast.txt2vid.v1', 'txt2vid'],
      ['inference.minimax.h3.fast.img2vid.v1', 'img2vid'],
      ['inference.minimax.h3.fast.ref2vid.v1', 'ref2vid'],
    ]).get(this.modelId);

    const inputs: Array<{ file: VideoModelV4File; name: string }> = [];

    if (h3Mode != null) {
      if (options.duration !== undefined) {
        jobConfig.duration = options.duration;
      }
      if (options.aspectRatio !== undefined) {
        if (h3Mode === 'img2vid' || options.aspectRatio === 'adaptive') {
          warnings.push({
            type: 'unsupported',
            feature: 'aspectRatio',
            details:
              'H3 uses the input aspect ratio for image-to-video and does not accept an adaptive aspect ratio.',
          });
        } else {
          jobConfig.aspect_ratio = options.aspectRatio;
        }
      }
      if (options.resolution !== undefined) {
        warnings.push({
          type: 'unsupported',
          feature: 'resolution',
          details:
            'H3 fast generates at a 768px short edge. Use providerOptions.prodia.resolution: "768P" or omit resolution.',
        });
      }
      if (options.fps !== undefined && options.fps !== 24) {
        warnings.push({
          type: 'unsupported',
          feature: 'fps',
          details: 'H3 fast generates at 24 fps.',
        });
      }
      if (options.generateAudio === false) {
        warnings.push({
          type: 'unsupported',
          feature: 'generateAudio',
          details: 'H3 fast always generates synchronized audio.',
        });
      }

      const firstFrame =
        options.frameImages?.find(frame => frame.frameType === 'first_frame')
          ?.image ?? options.image;
      const lastFrame = options.frameImages?.find(
        frame => frame.frameType === 'last_frame',
      )?.image;
      const references = options.inputReferences ?? [];

      if (h3Mode === 'img2vid') {
        if (firstFrame == null || references.length > 0) {
          throw new InvalidArgumentError({
            argument: 'image',
            message:
              'H3 image-to-video requires a first frame and cannot use inputReferences.',
          });
        }
        inputs.push({ file: firstFrame, name: 'first_frame' });
        if (lastFrame != null) {
          inputs.push({ file: lastFrame, name: 'last_frame' });
        }
      } else if (h3Mode === 'ref2vid') {
        if (
          references.length === 0 ||
          references.length > 12 ||
          firstFrame != null ||
          lastFrame != null
        ) {
          throw new InvalidArgumentError({
            argument: 'inputReferences',
            message:
              'H3 reference-to-video requires 1–12 references and cannot use frame images.',
          });
        }
        inputs.push(
          ...references.map((file, index) => ({
            file,
            name: `reference_${index}`,
          })),
        );
      } else if (
        firstFrame != null ||
        lastFrame != null ||
        references.length > 0
      ) {
        throw new InvalidArgumentError({
          argument: 'model',
          message:
            'Use an H3 img2vid or ref2vid job type when providing media inputs.',
        });
      }
    } else if (options.image != null) {
      inputs.push({ file: options.image, name: 'input' });
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

    let multipartResult: {
      jobResult: ProdiaJobResult;
      videoBytes: Uint8Array;
      videoMediaType: string;
    };
    let responseHeaders: Record<string, string> | undefined;

    if (inputs.length > 0) {
      const resolvedInputs = await Promise.all(
        inputs.map(async input => {
          const data = await resolveVideoFileData(
            input.file,
            options.abortSignal,
          );
          return {
            ...data,
            name: input.name,
            filename: input.name + getExtension(data.mediaType),
          };
        }),
      );

      if (h3Mode === 'img2vid') {
        for (const input of resolvedInputs) {
          if (!input.mediaType.startsWith('image/')) {
            throw new InvalidArgumentError({
              argument: 'frameImages',
              message: 'H3 frame inputs must be images.',
            });
          }
          jobConfig[input.name] = input.filename;
        }
      } else if (h3Mode === 'ref2vid') {
        const counts = { image: 0, video: 0, audio: 0 };
        for (const input of resolvedInputs) {
          const kind = input.mediaType.split('/')[0];
          if (kind !== 'image' && kind !== 'video' && kind !== 'audio') {
            throw new InvalidArgumentError({
              argument: 'inputReferences',
              message: 'H3 references must be images, videos, or audio.',
            });
          }
          counts[kind]++;
        }
        if (
          counts.image > 9 ||
          counts.video > 3 ||
          counts.audio > 3 ||
          counts.image + counts.video === 0
        ) {
          throw new InvalidArgumentError({
            argument: 'inputReferences',
            message:
              'H3 supports up to 9 images, 3 videos, and 3 audio references, with at least one image or video.',
          });
        }
        jobConfig.references = resolvedInputs.map(input => input.filename);
      }

      const formData = new FormData();
      formData.append(
        'job',
        new Blob([JSON.stringify(body)], { type: 'application/json' }),
        'job.json',
      );
      for (const input of resolvedInputs) {
        formData.append(
          'input',
          new Blob([input.bytes], { type: input.mediaType }),
          input.filename,
        );
      }

      const result = await postFormDataToApi({
        url: `${this.config.baseURL}/job?price=true`,
        headers: {
          ...combinedHeaders,
          Accept: 'multipart/form-data; video/mp4',
        },
        formData,
        failedResponseHandler: prodiaFailedResponseHandler,
        successfulResponseHandler: createVideoMultipartResponseHandler(),
        abortSignal: options.abortSignal,
        fetch: this.config.fetch,
      });

      multipartResult = result.value;
      responseHeaders = result.responseHeaders;
    } else {
      // txt2vid: JSON request
      const result = await postToApi({
        url: `${this.config.baseURL}/job?price=true`,
        headers: {
          ...combinedHeaders,
          Accept: 'multipart/form-data; video/mp4',
          'Content-Type': 'application/json',
        },
        body: {
          content: JSON.stringify(body),
          values: body,
        },
        failedResponseHandler: prodiaFailedResponseHandler,
        successfulResponseHandler: createVideoMultipartResponseHandler(),
        abortSignal: options.abortSignal,
        fetch: this.config.fetch,
      });

      multipartResult = result.value;
      responseHeaders = result.responseHeaders;
    }

    const { jobResult, videoBytes, videoMediaType } = multipartResult;

    return {
      videos: [
        {
          type: 'binary',
          data: videoBytes,
          mediaType: videoMediaType,
        },
      ],
      warnings,
      providerMetadata: {
        prodia: {
          videos: [buildProdiaProviderMetadata(jobResult)],
        },
      },
      response: {
        modelId: this.modelId,
        timestamp: currentDate,
        headers: responseHeaders,
      },
    };
  }
}

interface VideoMultipartResult {
  jobResult: ProdiaJobResult;
  videoBytes: Uint8Array;
  videoMediaType: string;
}

function createVideoMultipartResponseHandler() {
  return async ({
    response,
  }: {
    response: Response;
  }): Promise<{
    value: VideoMultipartResult;
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
    let videoBytes: Uint8Array | undefined;
    let videoMediaType = 'video/mp4';

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
        videoBytes = part.body;
        if (partContentType.startsWith('video/')) {
          videoMediaType = partContentType;
        }
      } else if (partContentType.startsWith('video/')) {
        videoBytes = part.body;
        videoMediaType = partContentType;
      }
    }

    if (!jobResult) {
      throw new Error('Prodia multipart response missing job part');
    }
    if (!videoBytes) {
      throw new Error('Prodia multipart response missing output video');
    }

    return {
      value: { jobResult, videoBytes, videoMediaType },
      responseHeaders,
    };
  };
}

async function resolveVideoFileData(
  file: VideoModelV4File,
  abortSignal?: AbortSignal,
): Promise<{ bytes: Uint8Array; mediaType: string }> {
  if (file.type === 'file') {
    const data =
      typeof file.data === 'string'
        ? convertBase64ToUint8Array(file.data)
        : file.data;
    return { bytes: data, mediaType: file.mediaType };
  }
  // URL type - download via downloadBlob so the user-supplied URL is routed
  // through the SSRF guard (validateDownloadUrl) instead of being fetched
  // directly, preventing requests to private/internal addresses.
  const blob = await downloadBlob(file.url, { abortSignal });
  const arrayBuffer = await blob.arrayBuffer();
  const mediaType = file.mediaType ?? (blob.type || 'application/octet-stream');
  return { bytes: new Uint8Array(arrayBuffer), mediaType };
}

function getExtension(mediaType: string): string {
  const map: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
    'audio/mpeg': '.mp3',
    'audio/mp4': '.m4a',
    'audio/wav': '.wav',
    'audio/ogg': '.ogg',
  };
  return map[mediaType] ?? '';
}
