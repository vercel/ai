import {
  AISDKError,
  APICallError,
  type Experimental_ArtifactModelV4,
  type Experimental_ArtifactModelV4ArtifactData,
  type Experimental_ArtifactModelV4File,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertUint8ArrayToBase64,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  delay,
  getFromApi,
  parseProviderOptions,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { FalConfig } from './fal-config';
import {
  falArtifactModelOptionsSchema,
  type FalArtifactModelOptions,
} from './fal-artifact-model-options';
import {
  FalArtifactJobError,
  FalArtifactSubmissionError,
} from './fal-artifact-job-error';
import { falErrorDataSchema, falFailedResponseHandler } from './fal-error';
import type { FalArtifactModelId } from './fal-artifact-settings';

interface FalArtifactModelConfig extends FalConfig {
  _internal?: {
    currentDate?: () => Date;
  };
}

export class FalArtifactModel implements Experimental_ArtifactModelV4 {
  readonly specificationVersion = 'v4' as const;

  constructor(
    readonly modelId: FalArtifactModelId,
    private readonly config: FalArtifactModelConfig,
  ) {}

  get provider(): string {
    return this.config.provider;
  }

  async doGenerate(
    options: Parameters<Experimental_ArtifactModelV4['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<Experimental_ArtifactModelV4['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const warnings: SharedV4Warning[] = [];
    const falOptions = (await parseProviderOptions({
      provider: 'fal',
      providerOptions: options.providerOptions,
      schema: falArtifactModelOptionsSchema,
    })) as FalArtifactModelOptions | undefined;

    const body = this.getRequestBody({
      prompt: options.prompt,
      inputs: options.inputs,
      falOptions,
    });
    const submitUrl = this.config.url({
      path: `https://queue.fal.run/${this.modelId}`,
      modelId: this.modelId,
    });
    const requestHeaders = combineHeaders(
      this.config.headers?.(),
      options.headers,
    );

    // Avoid calling a custom fetch implementation at all when cancellation is
    // already known. Abort errors after dispatch are ambiguous: Fal may have
    // accepted the request before the response was lost.
    if (options.abortSignal?.aborted) {
      options.abortSignal.throwIfAborted();
    }

    let queueResponse: z.infer<typeof falArtifactJobResponseSchema>;
    try {
      const result = await postJsonToApi({
        url: submitUrl,
        headers: requestHeaders,
        body,
        failedResponseHandler: falFailedResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(
          falArtifactJobResponseSchema,
        ),
        abortSignal: options.abortSignal,
        fetch: this.config.fetch,
      });
      queueResponse = result.value;
    } catch (error) {
      // An invalid 2xx queue response may still represent accepted, billable
      // work. Mark it so routing layers do not submit a duplicate fallback.
      if (
        APICallError.isInstance(error) &&
        error.statusCode != null &&
        error.statusCode >= 200 &&
        error.statusCode < 300
      ) {
        throw new FalArtifactJobError({
          message: error.message,
          cause: error,
        });
      }

      // A non-2xx response proves that Fal rejected the submission. A
      // transport failure or abort after dispatch does not: the job may have
      // committed before the response was lost, so callers must fail closed.
      if (!APICallError.isInstance(error) || error.statusCode == null) {
        throw new FalArtifactSubmissionError({
          message:
            error instanceof Error
              ? error.message
              : 'Fal queue submission may have been accepted',
          cause: error,
        });
      }

      throw error;
    }

    const requestId = queueResponse.request_id ?? undefined;

    try {
      if (queueResponse.status_url == null) {
        throw new AISDKError({
          name: 'FAL_ARTIFACT_GENERATION_ERROR',
          message: 'No status URL returned from queue endpoint',
        });
      }

      if (queueResponse.response_url == null) {
        throw new AISDKError({
          name: 'FAL_ARTIFACT_GENERATION_ERROR',
          message: 'No response URL returned from queue endpoint',
        });
      }

      const { value: response, responseHeaders } = await this.pollForResult({
        statusUrl: queueResponse.status_url,
        responseUrl: queueResponse.response_url,
        submitUrl,
        requestHeaders,
        pollIntervalMs: falOptions?.pollIntervalMs ?? 2000,
        pollTimeoutMs: falOptions?.pollTimeoutMs ?? 300000,
        abortSignal: options.abortSignal,
      });
      const artifacts = collectArtifacts(response);

      if (artifacts.length === 0) {
        throw new AISDKError({
          name: 'FAL_ARTIFACT_GENERATION_ERROR',
          message: 'No artifact files in response',
        });
      }

      return {
        artifacts,
        warnings,
        response: {
          timestamp: currentDate,
          modelId: this.modelId,
          headers: responseHeaders,
        },
        providerMetadata: {
          fal: {
            ...(requestId != null ? { requestId } : {}),
            ...(response.rendered_image != null
              ? { renderedImage: toFileMetadata(response.rendered_image) }
              : {}),
          },
        },
      };
    } catch (error) {
      if (FalArtifactJobError.isInstance(error)) {
        throw error;
      }

      throw new FalArtifactJobError({
        message:
          error instanceof Error
            ? error.message
            : 'Fal artifact generation failed after the job was accepted',
        requestId,
        cause: error,
      });
    }
  }

  private getRequestBody({
    prompt,
    inputs,
    falOptions,
  }: {
    prompt: string | undefined;
    inputs: Experimental_ArtifactModelV4File[] | undefined;
    falOptions: FalArtifactModelOptions | undefined;
  }): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    const inputUrls = inputs?.map(toFalFileUrl) ?? [];

    if (this.modelId.endsWith('/text-to-3d')) {
      if (prompt != null) {
        body.prompt = prompt;
      }
    } else if (this.modelId.endsWith('/multiview-to-3d')) {
      if (inputUrls.length > 0) {
        body.image_urls = inputUrls;
      }
    } else if (this.modelId.endsWith('/image-to-3d')) {
      if (inputUrls[0] != null) {
        body.image_url = inputUrls[0];
      }
    } else if (this.modelId.endsWith('/remesh')) {
      if (inputUrls[0] != null) {
        body.model_url = inputUrls[0];
      }
    } else if (this.modelId.endsWith('/smart-topology')) {
      if (inputUrls[0] != null) {
        body.input_file_url = inputUrls[0];
      }
    } else {
      if (prompt != null) {
        body.prompt = prompt;
      }
      if (inputUrls.length === 1) {
        body.input_url = inputUrls[0];
      } else if (inputUrls.length > 1) {
        body.input_urls = inputUrls;
      }
    }

    if (falOptions != null) {
      for (const [key, value] of Object.entries(falOptions)) {
        if (
          key !== 'pollIntervalMs' &&
          key !== 'pollTimeoutMs' &&
          value !== undefined &&
          value !== null
        ) {
          body[toSnakeCase(key)] = value;
        }
      }
    }

    return body;
  }

  private async pollForResult({
    statusUrl,
    responseUrl,
    submitUrl,
    requestHeaders,
    pollIntervalMs,
    pollTimeoutMs,
    abortSignal,
  }: {
    statusUrl: string;
    responseUrl: string;
    submitUrl: string;
    requestHeaders: Record<string, string | undefined> | undefined;
    pollIntervalMs: number;
    pollTimeoutMs: number;
    abortSignal: AbortSignal | undefined;
  }): Promise<{
    value: FalArtifactResponse;
    responseHeaders: Record<string, string> | undefined;
  }> {
    const startTime = Date.now();

    let completedResponseUrl = responseUrl;

    while (true) {
      if (abortSignal?.aborted) {
        throw new AISDKError({
          name: 'FAL_ARTIFACT_GENERATION_ABORTED',
          message: 'Artifact generation request was aborted',
        });
      }

      const { value: status } = await getFromApi({
        url: this.config.url({ path: statusUrl, modelId: this.modelId }),
        // These URLs are supplied by Fal. Validate them, and only attach
        // credentials while they remain on the accepted queue origin.
        validateUrl: true,
        credentialedOrigin: submitUrl,
        trustedOrigin: submitUrl,
        headers: requestHeaders,
        failedResponseHandler: falFailedResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(
          falArtifactStatusResponseSchema,
        ),
        abortSignal,
        fetch: this.config.fetch,
      });

      if (status.status === 'COMPLETED') {
        if (status.error != null || status.error_type != null) {
          throw new AISDKError({
            name: 'FAL_ARTIFACT_GENERATION_ERROR',
            message:
              status.error ??
              `Fal artifact generation failed (${status.error_type})`,
          });
        }

        completedResponseUrl = status.response_url ?? completedResponseUrl;
        break;
      }

      if (Date.now() - startTime >= pollTimeoutMs) {
        throw new AISDKError({
          name: 'FAL_ARTIFACT_GENERATION_TIMEOUT',
          message: `Artifact generation request timed out after ${pollTimeoutMs}ms`,
        });
      }

      await delay(pollIntervalMs);
    }

    const result = await getFromApi({
      url: this.config.url({
        path: completedResponseUrl,
        modelId: this.modelId,
      }),
      validateUrl: true,
      credentialedOrigin: submitUrl,
      trustedOrigin: submitUrl,
      headers: requestHeaders,
      failedResponseHandler: createJsonErrorResponseHandler({
        errorSchema: falErrorDataSchema,
        errorToMessage: data => data.error.message,
      }),
      successfulResponseHandler: createJsonResponseHandler(
        falArtifactResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    return {
      value: result.value,
      responseHeaders: result.responseHeaders,
    };
  }
}

const falArtifactJobResponseSchema = z.object({
  request_id: z.string().nullish(),
  response_url: z.string().nullish(),
  status_url: z.string().nullish(),
});

const falArtifactStatusResponseSchema = z.object({
  status: z.enum(['IN_QUEUE', 'IN_PROGRESS', 'COMPLETED']),
  response_url: z.string().nullish(),
  error: z.string().nullish(),
  error_type: z.string().nullish(),
});

const falFileSchema = z.object({
  url: z.string(),
  content_type: z.string().nullish(),
  file_name: z.string().nullish(),
  file_size: z.number().nullish(),
});

const falArtifactResponseSchema = z.object({
  status: z.string().nullish(),
  model_mesh: falFileSchema.nullish(),
  model_glb: falFileSchema.nullish(),
  model_urls: z.record(z.string(), falFileSchema.nullable()).nullish(),
  rendered_image: falFileSchema.nullish(),
});

type FalFile = z.infer<typeof falFileSchema>;
type FalArtifactResponse = z.infer<typeof falArtifactResponseSchema>;

function toFalFileUrl(file: Experimental_ArtifactModelV4File): string {
  if (file.type === 'url') {
    return file.url;
  }

  return `data:${file.mediaType};base64,${
    typeof file.data === 'string'
      ? file.data
      : convertUint8ArrayToBase64(file.data)
  }`;
}

function collectArtifacts(
  response: FalArtifactResponse,
): Experimental_ArtifactModelV4ArtifactData[] {
  const artifacts: Experimental_ArtifactModelV4ArtifactData[] = [];
  const seenUrls = new Set<string>();

  const addFile = (file: FalFile | null | undefined, role: string) => {
    if (file == null || seenUrls.has(file.url)) {
      return;
    }

    seenUrls.add(file.url);
    artifacts.push({
      type: 'url',
      url: file.url,
      mediaType: file.content_type ?? inferMediaType(file),
      ...(file.file_name != null ? { filename: file.file_name } : {}),
      role,
    });
  };

  addFile(response.model_mesh, 'model_mesh');
  addFile(response.model_glb, 'model_glb');
  for (const [role, file] of Object.entries(response.model_urls ?? {})) {
    addFile(file, role);
  }
  addFile(response.rendered_image, 'preview');

  return artifacts;
}

function inferMediaType(file: FalFile): string {
  const path = (file.file_name ?? file.url).toLowerCase();

  if (path.endsWith('.glb')) return 'model/gltf-binary';
  if (path.endsWith('.gltf')) return 'model/gltf+json';
  if (path.endsWith('.obj')) return 'model/obj';
  if (path.endsWith('.stl')) return 'model/stl';
  if (path.endsWith('.usdz')) return 'model/vnd.usdz+zip';
  return 'application/octet-stream';
}

function toFileMetadata(file: FalFile): Record<string, string | number> {
  return {
    url: file.url,
    ...(file.content_type != null ? { contentType: file.content_type } : {}),
    ...(file.file_name != null ? { fileName: file.file_name } : {}),
    ...(file.file_size != null ? { fileSize: file.file_size } : {}),
  };
}

function toSnakeCase(value: string): string {
  return value.replace(/[A-Z]/g, character => `_${character.toLowerCase()}`);
}
