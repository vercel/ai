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
import type { ImageModel } from '../types/image-model';
import type { ImageModelResponseMetadata } from '../types/image-model-response-metadata';
import { addImageModelUsage, type ImageModelUsage } from '../types/usage';
import type { Warning } from '../types/warning';
import { prepareRetries } from '../util/prepare-retries';
import { RetryError } from '../util/retry-error';
import { VERSION } from '../version';
import type {
  GenerateImageCall,
  GenerateImageResult,
} from './generate-image-result';
import { convertDataContentToUint8Array } from '../prompt/data-content';
import { splitDataUrl } from '../prompt/split-data-url';

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
 * @param maxRetries - Maximum number of retries per image model call, including retries after unclassified empty responses. Provider-classified terminal responses are not retried. Set to 0 to disable retries. Default: 2.
 * @param abortSignal - An optional abort signal that can be used to cancel the call.
 * @param headers - Additional HTTP headers to be sent with the request. Only applicable for HTTP-based providers.
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
   * unclassified empty responses. Provider-classified terminal responses are
   * not retried. Set to 0 to disable retries.
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
}): Promise<GenerateImageResult> {
  const model = resolveImageModel(modelArg);

  const headersWithUserAgent = withUserAgentSuffix(
    headers ?? {},
    `ai/${VERSION}`,
  );

  const { retry } = prepareRetries({
    maxRetries: maxRetriesArg,
    abortSignal,
    additionalRetryableError: error =>
      error instanceof RetryableNoImageResultError,
  });

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
          const { prompt, files, mask } = normalizePrompt(promptArg);

          const result = await model.doGenerate({
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

          callResults.push(result);

          if (result.images.length === 0 && !isTerminalNoImageResult(result)) {
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
          mediaType:
            detectMediaType({
              data: image,
              topLevelType: 'image',
            }) ?? 'image/png',
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
            const currentGatewayMetadata = currentEntry as GatewayCostMetadata;
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
            delete (providerMetadata[providerName] as { images?: unknown })
              .images;
          }
        } else {
          providerMetadata[providerName] ??= { images: [] };
          providerMetadata[providerName].images.push(...metadata.images);
        }
      }
    }

    responses.push(result.response);
  }

  logWarnings({ warnings, provider: model.provider, model: model.modelId });

  if (!images.length) {
    throw new NoImageGeneratedError({ responses });
  }

  return new DefaultGenerateImageResult({
    images,
    calls,
    warnings,
    responses,
    providerMetadata,
    usage: totalUsage,
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
function getImageProviderMetadata(
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
      (imageMetadata ??= {})[providerName] = value;
    }
  }

  return imageMetadata;
}

function isTerminalNoImageResult(result: ImageModelV4Result): boolean {
  const googleMetadata = result.providerMetadata?.google;

  if (!isJSONObject(googleMetadata)) {
    return false;
  }

  const promptFeedback = googleMetadata.promptFeedback;

  return (
    isJSONObject(promptFeedback) &&
    typeof promptFeedback.blockReason === 'string'
  );
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

function normalizePrompt(
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
