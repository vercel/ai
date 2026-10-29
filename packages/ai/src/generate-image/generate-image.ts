import {
  isJSONObject,
  type ImageModelV4,
  type ImageModelV4CallOptions,
  type ImageModelV4File,
  type ImageModelV4ProviderMetadata,
  type ImageModelV4Result,
  type JSONObject,
} from '@ai-sdk/provider';
import {
  convertBase64ToUint8Array,
  createIdGenerator,
  detectMediaType,
  withUserAgentSuffix,
  type DataContent,
  type ProviderOptions,
} from '@ai-sdk/provider-utils';
import { NoImageGeneratedError } from '../error/no-image-generated-error';
import {
  DefaultGeneratedFile,
  type GeneratedFile,
} from '../generate-text/generated-file';
import { logWarnings } from '../logger/log-warnings';
import { resolveImageModel } from '../model/resolve-model';
import { createTelemetryDispatcher } from '../telemetry/create-telemetry-dispatcher';
import type { TelemetryOptions } from '../telemetry/telemetry-options';
import type { ImageModel } from '../types/image-model';
import type { ImageModelResponseMetadata } from '../types/image-model-response-metadata';
import { addImageModelUsage, type ImageModelUsage } from '../types/usage';
import type { Warning } from '../types/warning';
import { getBase64OrBinaryByteLength } from '../util/get-base64-or-binary-byte-length';
import { getOwn } from '../util/get-own';
import { notify } from '../util/notify';
import { setOwn } from '../util/set-own';
import { prepareRetries } from '../util/prepare-retries';
import { RetryError } from '../util/retry-error';
import { VERSION } from '../version';
import type {
  GenerateImageCall,
  GenerateImageResult,
} from './generate-image-result';
import { convertDataContentToUint8Array } from '../prompt/data-content';
import { splitDataUrl } from '../prompt/split-data-url';
import type {
  GenerateImageEndEvent,
  GenerateImageInputFile,
  GenerateImageOutputFile,
  GenerateImageStartEvent,
  ImageModelCallStartEvent,
} from './image-events';

const originalGenerateCallId = createIdGenerator({
  prefix: 'call',
  size: 24,
});

const gatewayCostMetadataKeys = [
  'cost',
  'gatewayCost',
  'inferenceCost',
  'inputInferenceCost',
  'marketCost',
  'outputInferenceCost',
  'surchargeCost',
] as const;

type GatewayCostMetadata = {
  [key in (typeof gatewayCostMetadataKeys)[number]]?: unknown;
};

class RetryableNoImageResultError extends Error {
  constructor() {
    super('No image generated.');
    this.name = 'RetryableNoImageResultError';
  }
}

export type GenerateImagePrompt =
  | string
  | {
      images: Array<DataContent>;
      text?: string;
      mask?: DataContent;
    };

/**
 * Generates images using an image model.
 *
 * @param model - The image model to use.
 * @param prompt - The prompt that should be used to generate the image.
 * @param n - Number of images to generate. Default: 1.
 * @param maxImagesPerCall - Maximum number of images to generate in a single API call.
 * @param size - Size of the images to generate. Must have the format `{width}x{height}`.
 * @param aspectRatio - Aspect ratio of the images to generate. Must have the format `{width}:{height}`.
 * @param seed - Seed for the image generation.
 * @param providerOptions - Additional provider-specific options that are passed through to the provider
 * as body parameters.
 * @param maxRetries - Maximum number of retries per image model call, including retries after unclassified empty responses. Empty responses marked as not retryable by the provider are not retried. Set to 0 to disable retries. Default: 2.
 * @param abortSignal - An optional abort signal that can be used to cancel the call.
 * @param headers - Additional HTTP headers to be sent with the request. Only applicable for HTTP-based providers.
 * @param telemetry - Optional telemetry configuration.
 *
 * @returns A result object that contains the generated images.
 */
export async function generateImage({
  model: modelArg,
  prompt: promptArg,
  n = 1,
  maxImagesPerCall,
  size,
  aspectRatio,
  seed,
  providerOptions,
  maxRetries: maxRetriesArg,
  abortSignal,
  headers,
  telemetry,
  _internal: { generateCallId = originalGenerateCallId } = {},
}: {
  /**
   * The image model to use.
   */
  model: ImageModel;

  /**
   * The prompt that should be used to generate the image.
   */
  prompt: GenerateImagePrompt;

  /**
   * Number of images to generate.
   */
  n?: number;

  /**
   * Maximum number of images to generate in a single API call. If not provided, the model's default will be used.
   */
  maxImagesPerCall?: number;

  /**
   * Size of the images to generate. Must have the format `{width}x{height}`. If not provided, the default size will be used.
   */
  size?: `${number}x${number}`;

  /**
   * Aspect ratio of the images to generate. Must have the format `{width}:{height}`. If not provided, the default aspect ratio will be used.
   */
  aspectRatio?: `${number}:${number}`;

  /**
   * Seed for the image generation. If not provided, the default seed will be used.
   */
  seed?: number;

  /**
   * Additional provider-specific options that are passed through to the provider
   * as body parameters.
   *
   * The outer record is keyed by the provider name, and the inner
   * record is keyed by the provider-specific metadata key.
   * ```ts
   * {
   * "openai": {
   * "style": "vivid"
   * }
   * }
   * ```
   */
  providerOptions?: ProviderOptions;

  /**
   * Maximum number of retries per image model call, including retries after
   * unclassified empty responses. Empty responses marked as not retryable by
   * the provider are not retried. Set to 0 to disable retries.
   *
   * @default 2
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
   * Optional telemetry configuration.
   */
  telemetry?: TelemetryOptions;

  /**
   * Internal. For test use only. May change without notice.
   */
  _internal?: {
    generateCallId?: () => string;
  };
}): Promise<GenerateImageResult> {
  const model = resolveImageModel(modelArg);

  const headersWithUserAgent = withUserAgentSuffix(
    headers ?? {},
    `ai/${VERSION}`,
  );

  const { maxRetries, retry } = prepareRetries({
    maxRetries: maxRetriesArg,
    abortSignal,
    additionalRetryableError: error =>
      error instanceof RetryableNoImageResultError,
  });

  const { prompt, files, mask } = normalizePrompt(promptArg);

  const callId = generateCallId();
  const telemetryDispatcher = createTelemetryDispatcher({ telemetry });
  const runInTracingChannelSpan =
    telemetryDispatcher.runInTracingChannelSpan ??
    (async <T>({ execute }: { execute: () => PromiseLike<T> }) =>
      await execute());

  const startEvent: GenerateImageStartEvent = {
    callId,
    operationId: 'ai.generateImage',
    provider: model.provider,
    modelId: model.modelId,
    prompt,
    images: files?.map(getInputFileMetadata),
    mask: mask == null ? undefined : getInputFileMetadata(mask),
    n,
    maxImagesPerCall,
    size,
    aspectRatio,
    seed,
    maxRetries,
    headers,
    providerOptions,
  };

  return await runInTracingChannelSpan({
    type: 'generateImage',
    event: startEvent,
    execute: async () => {
      await notify({
        event: startEvent,
        callbacks: [telemetryDispatcher.onStart],
      });

      try {
        // default to 1 if the model has not specified limits on
        // how many images can be generated in a single call
        const maxImagesPerCallWithDefault =
          maxImagesPerCall ?? (await invokeModelMaxImagesPerCall(model)) ?? 1;

        // parallelize calls to the model:
        const callCount = Math.ceil(n / maxImagesPerCallWithDefault);
        const callImageCounts = Array.from({ length: callCount }, (_, i) => {
          if (i < callCount - 1) {
            return maxImagesPerCallWithDefault;
          }

          const remainder = n % maxImagesPerCallWithDefault;
          return remainder === 0 ? maxImagesPerCallWithDefault : remainder;
        });

        const resultGroups = await Promise.all(
          callImageCounts.map(async callImageCount => {
            const callResults: Array<ImageModelV4Result> = [];

            try {
              await retry(async () => {
                const modelCallStartEvent: ImageModelCallStartEvent = {
                  callId,
                  imageCallId: generateCallId(),
                  operationId: 'ai.generateImage.doGenerate',
                  provider: model.provider,
                  modelId: model.modelId,
                  n: callImageCount,
                };

                await notify({
                  event: modelCallStartEvent,
                  callbacks: [telemetryDispatcher.onImageModelCallStart],
                });

                let result: ImageModelV4Result;
                try {
                  result = await model.doGenerate({
                    prompt,
                    files,
                    mask,
                    n: callImageCount,
                    abortSignal,
                    headers: headersWithUserAgent,
                    size,
                    aspectRatio,
                    seed,
                    providerOptions: providerOptions ?? {},
                  });
                } catch (error) {
                  await notify({
                    event: { ...modelCallStartEvent, error },
                    callbacks: [telemetryDispatcher.onImageModelCallError],
                  });
                  throw error;
                }

                if (telemetryDispatcher.onImageModelCallEnd != null) {
                  await notify({
                    event: {
                      ...modelCallStartEvent,
                      images: result.images.map(image => ({
                        mediaType: getImageMediaType(image),
                        byteLength: getBase64OrBinaryByteLength(image),
                      })),
                      usage: result.usage,
                      warnings: result.warnings,
                      providerMetadata: result.providerMetadata,
                      response: getTelemetryResponseMetadata(result.response),
                    },
                    callbacks: [telemetryDispatcher.onImageModelCallEnd],
                  });
                }

                callResults.push(result);

                if (
                  result.images.length === 0 &&
                  result.isRetryable !== false
                ) {
                  throw new RetryableNoImageResultError();
                }

                return result;
              });

              return callResults;
            } catch (error) {
              const noImageResultError =
                error instanceof RetryableNoImageResultError
                  ? error
                  : RetryError.isInstance(error) &&
                      error.lastError instanceof RetryableNoImageResultError
                    ? error.lastError
                    : undefined;

              if (noImageResultError != null) {
                return callResults;
              }

              throw error;
            }
          }),
        );
        const results = resultGroups.flat();

        // collect result images, warnings, and response metadata
        const images: Array<GeneratedFile> = [];
        const calls: Array<GenerateImageCall> = [];
        const warnings: Array<Warning> = [];
        const responses: Array<ImageModelResponseMetadata> = [];
        const providerMetadata: ImageModelV4ProviderMetadata = {};
        let totalUsage: ImageModelUsage = {
          inputTokens: undefined,
          outputTokens: undefined,
          totalTokens: undefined,
        };
        for (const result of results) {
          const callImages = result.images.map(
            (image, index) =>
              new DefaultGeneratedFile({
                data: image,
                mediaType: getImageMediaType(image),
                providerMetadata: getImageProviderMetadata(
                  result.providerMetadata,
                  index,
                ),
              }),
          );
          images.push(...callImages);
          calls.push({
            images: callImages,
            providerMetadata: result.providerMetadata,
            response: result.response,
            warnings: result.warnings,
            usage: result.usage,
          });
          warnings.push(...result.warnings);

          if (result.usage != null) {
            totalUsage = addImageModelUsage(totalUsage, result.usage);
          }

          if (result.providerMetadata) {
            for (const [providerName, metadata] of Object.entries(
              result.providerMetadata,
            )) {
              if (providerName === 'gateway') {
                const currentEntry = providerMetadata[providerName];
                if (currentEntry != null && typeof currentEntry === 'object') {
                  const currentGatewayMetadata =
                    currentEntry as GatewayCostMetadata;
                  const newGatewayMetadata = metadata as GatewayCostMetadata;

                  providerMetadata[providerName] = {
                    ...(currentEntry as object),
                    ...(metadata as object),
                    ...Object.fromEntries(
                      gatewayCostMetadataKeys.flatMap(key => {
                        const total = addDecimalStrings(
                          currentGatewayMetadata[key],
                          newGatewayMetadata[key],
                        );

                        return total == null ? [] : [[key, total]];
                      }),
                    ),
                  } as ImageModelV4ProviderMetadata[string];
                } else {
                  providerMetadata[providerName] = {
                    ...(metadata as object),
                  } as ImageModelV4ProviderMetadata[string];
                }
                const imagesValue = (
                  providerMetadata[providerName] as { images?: unknown }
                ).images;
                if (Array.isArray(imagesValue) && imagesValue.length === 0) {
                  delete (
                    providerMetadata[providerName] as { images?: unknown }
                  ).images;
                }
              } else {
                const currentEntry = getOwn(providerMetadata, providerName) ?? {
                  images: [],
                };
                currentEntry.images.push(...metadata.images);
                setOwn(providerMetadata, providerName, currentEntry);
              }
            }
          }

          responses.push(result.response);
        }

        logWarnings({
          warnings,
          provider: model.provider,
          model: model.modelId,
        });

        if (!images.length) {
          throw new NoImageGeneratedError({ calls, responses });
        }

        if (telemetryDispatcher.onEnd != null) {
          const outputImages: Array<GenerateImageOutputFile> = results
            .flatMap((result): Array<string | Uint8Array> => result.images)
            .map((image, index) => ({
              mediaType: images[index].mediaType,
              byteLength: getBase64OrBinaryByteLength(image),
            }));

          const endEvent: GenerateImageEndEvent = {
            callId,
            operationId: 'ai.generateImage',
            provider: model.provider,
            modelId: model.modelId,
            images: outputImages,
            usage: totalUsage,
            warnings,
            providerMetadata,
            responses: responses.map(getTelemetryResponseMetadata),
          };

          await notify({
            event: endEvent,
            callbacks: [telemetryDispatcher.onEnd],
          });
        }

        return new DefaultGenerateImageResult({
          images,
          calls,
          warnings,
          responses,
          providerMetadata,
          usage: totalUsage,
        });
      } catch (error) {
        await telemetryDispatcher.onError?.({ callId, error });
        throw error;
      }
    },
  });
}

class DefaultGenerateImageResult implements GenerateImageResult {
  readonly images: Array<GeneratedFile>;
  readonly calls: Array<GenerateImageCall>;
  readonly warnings: Array<Warning>;
  readonly responses: Array<ImageModelResponseMetadata>;
  readonly providerMetadata: ImageModelV4ProviderMetadata;
  readonly usage: ImageModelUsage;

  constructor(options: {
    images: Array<GeneratedFile>;
    calls: Array<GenerateImageCall>;
    warnings: Array<Warning>;
    responses: Array<ImageModelResponseMetadata>;
    providerMetadata: ImageModelV4ProviderMetadata;
    usage: ImageModelUsage;
  }) {
    this.images = options.images;
    this.calls = options.calls;
    this.warnings = options.warnings;
    this.responses = options.responses;
    this.providerMetadata = options.providerMetadata;
    this.usage = options.usage;
  }

  get image() {
    return this.images[0];
  }
}

/**
 * Extracts per-image metadata from the legacy `providerMetadata.<provider>.images` result shape.
 */
export function getImageProviderMetadata(
  providerMetadata: ImageModelV4ProviderMetadata | undefined,
  imageIndex: number,
): Record<string, JSONObject> | undefined {
  if (providerMetadata == null) {
    return undefined;
  }

  let imageMetadata: Record<string, JSONObject> | undefined;

  for (const [providerName, metadata] of Object.entries(providerMetadata)) {
    const value = metadata.images?.[imageIndex];

    if (isJSONObject(value) && !Array.isArray(value)) {
      setOwn((imageMetadata ??= {}), providerName, value);
    }
  }

  return imageMetadata;
}

function getImageMediaType(image: string | Uint8Array): string {
  return (
    detectMediaType({
      data: image,
      topLevelType: 'image',
    }) ?? 'image/png'
  );
}

function getInputFileMetadata(file: ImageModelV4File): GenerateImageInputFile {
  return file.type === 'url'
    ? { type: 'url', url: file.url }
    : {
        type: 'file',
        mediaType: file.mediaType,
        byteLength: getBase64OrBinaryByteLength(file.data),
      };
}

function getTelemetryResponseMetadata(
  response: ImageModelResponseMetadata,
): ImageModelResponseMetadata {
  return {
    timestamp: response.timestamp,
    modelId: response.modelId,
    headers: response.headers,
  };
}

async function invokeModelMaxImagesPerCall(model: ImageModelV4) {
  const isFunction = model.maxImagesPerCall instanceof Function;

  if (!isFunction) {
    return model.maxImagesPerCall;
  }

  return model.maxImagesPerCall({
    modelId: model.modelId,
  });
}

function addDecimalStrings(
  value1: unknown,
  value2: unknown,
): string | undefined {
  if (
    typeof value1 !== 'string' ||
    typeof value2 !== 'string' ||
    !/^\d+(?:\.\d+)?$/.test(value1) ||
    !/^\d+(?:\.\d+)?$/.test(value2)
  ) {
    return undefined;
  }

  const [integer1, fraction1 = ''] = value1.split('.');
  const [integer2, fraction2 = ''] = value2.split('.');
  const precision = Math.max(fraction1.length, fraction2.length);
  const sum =
    BigInt(integer1 + fraction1.padEnd(precision, '0')) +
    BigInt(integer2 + fraction2.padEnd(precision, '0'));
  const sumString = sum.toString().padStart(precision + 1, '0');

  return precision === 0
    ? sumString
    : `${sumString.slice(0, -precision)}.${sumString.slice(
        -precision,
      )}`.replace(/\.?0+$/, '');
}

export function normalizePrompt(
  prompt: GenerateImagePrompt,
): Pick<ImageModelV4CallOptions, 'prompt' | 'files' | 'mask'> {
  if (typeof prompt === 'string') {
    return { prompt, files: undefined, mask: undefined };
  }

  return {
    prompt: prompt.text,
    files: prompt.images.map(toImageModelV4File),
    mask: prompt.mask ? toImageModelV4File(prompt.mask) : undefined,
  };
}

function toImageModelV4File(dataContent: DataContent): ImageModelV4File {
  if (typeof dataContent === 'string' && dataContent.startsWith('http')) {
    return {
      type: 'url',
      url: dataContent,
    };
  }

  // Handle data URLs
  if (typeof dataContent === 'string' && dataContent.startsWith('data:')) {
    const { mediaType: dataUrlMediaType, base64Content } =
      splitDataUrl(dataContent);

    if (base64Content != null) {
      const uint8Data = convertBase64ToUint8Array(base64Content);
      return {
        type: 'file',
        data: uint8Data,
        mediaType:
          dataUrlMediaType ||
          detectMediaType({
            data: uint8Data,
            topLevelType: 'image',
          }) ||
          'image/png',
      };
    }
  }

  const uint8Data = convertDataContentToUint8Array(dataContent);
  return {
    type: 'file',
    data: uint8Data,
    mediaType:
      detectMediaType({
        data: uint8Data,
        topLevelType: 'image',
      }) || 'image/png',
  };
}
