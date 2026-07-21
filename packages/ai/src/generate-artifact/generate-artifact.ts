import type {
  Experimental_ArtifactModelV4CallOptions,
  Experimental_ArtifactModelV4File,
  SharedV4ProviderMetadata,
} from '@ai-sdk/provider';
import {
  detectMediaType,
  withUserAgentSuffix,
  type DataContent,
  type ProviderOptions,
} from '@ai-sdk/provider-utils';
import { NoArtifactGeneratedError } from '../error/no-artifact-generated-error';
import { logWarnings } from '../logger/log-warnings';
import { resolveArtifactModel } from '../model/resolve-model';
import { splitDataUrl } from '../prompt/split-data-url';
import type { ArtifactModel } from '../types/artifact-model';
import type { ArtifactModelResponseMetadata } from '../types/artifact-model-response-metadata';
import { createDownload } from '../util/download/create-download';
import { prepareRetries } from '../util/prepare-retries';
import { VERSION } from '../version';
import type { GenerateArtifactResult } from './generate-artifact-result';
import {
  DefaultGeneratedArtifact,
  type GeneratedArtifact,
} from './generated-artifact';

/**
 * An input file for artifact generation.
 *
 * A plain value can be a URL, data URL, base64-encoded file, or binary file.
 * Use the object form to preserve the media type, filename, role, or
 * provider-specific options.
 */
export type GenerateArtifactInput =
  | DataContent
  | {
      data: DataContent;
      mediaType?: string;
      filename?: string;
      role?: string;
      providerOptions?: ProviderOptions;
    };

const defaultDownload = createDownload();

/**
 * Generates files using an artifact model.
 *
 * Artifact generation commonly starts a paid asynchronous provider job. For
 * that reason, whole-model retries default to zero. Callers can explicitly opt
 * in to retries when their provider guarantees idempotent submission.
 *
 * @param model - The artifact model to use.
 * @param prompt - Optional text prompt for artifact generation.
 * @param inputs - Optional image, multi-image, or existing artifact inputs.
 * @param providerOptions - Additional provider-specific request options.
 * @param maxRetries - Maximum number of whole-model retries. Default: 0.
 * @param abortSignal - An optional abort signal that cancels the call.
 * @param headers - Additional HTTP headers for HTTP-based providers.
 *
 * @returns The generated artifacts and provider metadata.
 */
export async function experimental_generateArtifact({
  model: modelArg,
  prompt,
  inputs,
  providerOptions,
  maxRetries: maxRetriesArg,
  abortSignal,
  headers,
  download: downloadFn = defaultDownload,
}: {
  /**
   * The artifact model to use.
   */
  model: ArtifactModel;

  /**
   * Optional text prompt for artifact generation.
   */
  prompt?: string;

  /**
   * Optional image, multi-image, or existing artifact inputs.
   */
  inputs?: Array<GenerateArtifactInput>;

  /**
   * Additional provider-specific request options.
   */
  providerOptions?: ProviderOptions;

  /**
   * Maximum number of whole-model retries. Set to 0 to disable retries.
   *
   * @default 0
   */
  maxRetries?: number;

  /**
   * Abort signal.
   */
  abortSignal?: AbortSignal;

  /**
   * Additional headers to include in the request.
   * Only applicable for HTTP-based providers.
   */
  headers?: Record<string, string>;

  /**
   * Custom download function for fetching artifact URLs.
   */
  download?: (options: {
    url: URL;
    abortSignal?: AbortSignal;
  }) => Promise<{ data: Uint8Array; mediaType: string | undefined }>;
}): Promise<GenerateArtifactResult> {
  const model = resolveArtifactModel(modelArg);

  const headersWithUserAgent = withUserAgentSuffix(
    headers ?? {},
    `ai/${VERSION}`,
  );

  const { retry } = prepareRetries({
    maxRetries: maxRetriesArg ?? 0,
    abortSignal,
  });

  const result = await retry(() =>
    model.doGenerate({
      prompt,
      inputs: inputs?.map(normalizeArtifactInput),
      providerOptions: providerOptions ?? {},
      abortSignal,
      headers: headersWithUserAgent,
    } satisfies Experimental_ArtifactModelV4CallOptions),
  );

  const responses: Array<ArtifactModelResponseMetadata> = [
    {
      timestamp: result.response.timestamp,
      modelId: result.response.modelId,
      headers: result.response.headers,
      providerMetadata: result.providerMetadata,
    },
  ];

  if (result.artifacts.length === 0) {
    throw new NoArtifactGeneratedError({ responses });
  }

  const artifacts: Array<GeneratedArtifact> = await Promise.all(
    result.artifacts.map(async artifactData => {
      switch (artifactData.type) {
        case 'url': {
          const { data } = await downloadFn({
            url: new URL(artifactData.url),
            abortSignal,
          });

          return new DefaultGeneratedArtifact({
            data,
            mediaType: artifactData.mediaType,
            filename: artifactData.filename,
            role: artifactData.role,
          });
        }

        case 'base64':
        case 'binary':
          return new DefaultGeneratedArtifact({
            data: artifactData.data,
            mediaType: artifactData.mediaType,
            filename: artifactData.filename,
            role: artifactData.role,
          });
      }
    }),
  );

  if (result.warnings.length > 0) {
    logWarnings({
      warnings: result.warnings,
      provider: model.provider,
      model: model.modelId,
    });
  }

  return {
    artifact: artifacts[0],
    artifacts,
    warnings: result.warnings,
    responses,
    providerMetadata:
      result.providerMetadata ?? ({} satisfies SharedV4ProviderMetadata),
  };
}

function normalizeArtifactInput(
  input: GenerateArtifactInput,
): Experimental_ArtifactModelV4File {
  let data: DataContent;
  let mediaType: string | undefined;
  let filename: string | undefined;
  let role: string | undefined;
  let providerOptions: ProviderOptions | undefined;

  if (isInputWithMetadata(input)) {
    data = input.data;
    mediaType = input.mediaType;
    filename = input.filename;
    role = input.role;
    providerOptions = input.providerOptions;
  } else {
    data = input;
  }

  if (
    typeof data === 'string' &&
    (data.startsWith('http://') || data.startsWith('https://'))
  ) {
    return {
      type: 'url',
      url: data,
      mediaType,
      filename,
      role,
      providerOptions,
    };
  }

  if (typeof data === 'string' && data.startsWith('data:')) {
    const { mediaType: dataUrlMediaType, base64Content } = splitDataUrl(data);
    return {
      type: 'file',
      data: base64Content ?? '',
      mediaType: mediaType ?? dataUrlMediaType ?? 'application/octet-stream',
      filename,
      role,
      providerOptions,
    };
  }

  const normalizedData =
    data instanceof ArrayBuffer ? new Uint8Array(data) : data;

  return {
    type: 'file',
    data: normalizedData,
    mediaType:
      mediaType ??
      detectMediaType({ data: normalizedData }) ??
      'application/octet-stream',
    filename,
    role,
    providerOptions,
  };
}

function isInputWithMetadata(
  input: GenerateArtifactInput,
): input is Exclude<GenerateArtifactInput, DataContent> {
  return (
    typeof input === 'object' &&
    input != null &&
    !(input instanceof Uint8Array) &&
    !(input instanceof ArrayBuffer) &&
    'data' in input
  );
}
