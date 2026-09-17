import {
  InvalidArgumentError,
  type ImageModelV4,
  type ImageModelV4CallOptions,
  type ImageModelV4File,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  convertUint8ArrayToBase64,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  parseProviderOptions,
  postJsonToApi,
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import {
  quiveraiImageModelOptionsSchema,
  type QuiverAIImageModelOptions,
} from './quiverai-image-model-options';
import type {
  QuiverAIImageModelId,
  QuiverAIOperation,
} from './quiverai-image-settings';

interface QuiverAIImageModelConfig {
  provider: string;
  baseURL: string;
  headers?: () => Record<string, string>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
}

export class QuiverAIImageModel implements ImageModelV4 {
  readonly specificationVersion = 'v4';
  readonly maxImagesPerCall = 16;

  get provider(): string {
    return this.config.provider;
  }

  static [WORKFLOW_SERIALIZE](model: QuiverAIImageModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: QuiverAIImageModelId;
    config: QuiverAIImageModelConfig;
  }) {
    return new QuiverAIImageModel(options.modelId, options.config);
  }

  constructor(
    readonly modelId: QuiverAIImageModelId,
    private readonly config: QuiverAIImageModelConfig,
  ) {}

  async doGenerate({
    prompt,
    n,
    files,
    mask,
    size,
    aspectRatio,
    seed,
    providerOptions,
    headers,
    abortSignal,
  }: ImageModelV4CallOptions): Promise<
    Awaited<ReturnType<ImageModelV4['doGenerate']>>
  > {
    const quiveraiOptions = await parseProviderOptions({
      provider: 'quiverai',
      providerOptions,
      schema: quiveraiImageModelOptionsSchema,
    });

    const operation: QuiverAIOperation =
      quiveraiOptions?.operation ?? 'generate';

    const warnings = collectWarnings({ size, aspectRatio, seed, mask });

    const body = buildRequestBody({
      modelId: this.modelId,
      n,
      prompt,
      files,
      mask,
      operation,
      options: quiveraiOptions ?? {},
    });

    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const combinedHeaders = combineHeaders(this.config.headers?.(), headers);

    const { value: response, responseHeaders } = await postJsonToApi({
      url: `${this.config.baseURL}${getOperationPath(operation)}`,
      headers: combinedHeaders,
      body,
      failedResponseHandler: quiveraiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        svgGenerationResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    const encoder = new TextEncoder();
    const images = response.data.map(image => encoder.encode(image.svg));

    return {
      images,
      warnings,
      providerMetadata: {
        quiverai: {
          ...(response.credits != null && { credits: response.credits }),
          images: response.data.map((image, index) => ({
            index,
            mimeType: image.mime_type,
            ...(image.loop_period_ms !== undefined && {
              loopPeriodMs: image.loop_period_ms,
            }),
            ...(image.opening_animation_ms !== undefined && {
              openingAnimationMs: image.opening_animation_ms,
            }),
          })),
        },
      },
      response: {
        timestamp: response.created
          ? new Date(response.created * 1000)
          : currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
      },
      ...(response.usage && {
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          totalTokens: response.usage.total_tokens,
        },
      }),
    };
  }
}

function getOperationPath(operation: QuiverAIOperation) {
  switch (operation) {
    case 'generate':
      return '/svgs/generations';
    case 'vectorize':
      return '/svgs/vectorizations';
    case 'animate':
      return '/svgs/animations';
  }
}

function getGenerateReferenceLimit(modelId: string) {
  // Only apply the lower limit to documented Arrow 1.x models. The API
  // enforces model-specific limits within its 16-reference request limit.
  return ['arrow-1', 'arrow-1.0', 'arrow-1.1'].includes(modelId) ? 4 : 16;
}

function toQuiverAIImageReference(image: ImageModelV4File) {
  if (image.type === 'url') {
    return { url: image.url };
  }
  return {
    base64:
      typeof image.data === 'string'
        ? image.data
        : convertUint8ArrayToBase64(image.data),
  };
}

const maxAnimationSourceBase64Length = 1_066_668;

function toQuiverAIAnimationSource(image: ImageModelV4File) {
  if (image.type === 'url') {
    let url: URL;
    try {
      url = new URL(image.url);
    } catch {
      throw new InvalidArgumentError({
        argument: 'files',
        message: 'QuiverAI animate requires a valid HTTP or HTTPS SVG URL.',
      });
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new InvalidArgumentError({
        argument: 'files',
        message: 'QuiverAI animate requires an HTTP or HTTPS SVG URL.',
      });
    }

    return { url: image.url };
  }

  let base64: string;
  let bytes: Uint8Array;

  if (typeof image.data === 'string') {
    const dataUrlMatch =
      /^data:image\/svg\+xml(?:;[^,]*)?;base64,([\s\S]+)$/i.exec(image.data);
    const encodedData = dataUrlMatch?.[1] ?? image.data;

    try {
      bytes = convertBase64ToUint8Array(encodedData);
    } catch {
      throw new InvalidArgumentError({
        argument: 'files',
        message:
          'QuiverAI animate requires the source SVG string to be valid base64 or an SVG data URL.',
      });
    }
    base64 = convertUint8ArrayToBase64(bytes);
  } else {
    bytes = image.data;
    base64 = convertUint8ArrayToBase64(bytes);
  }

  if (!isSvg(bytes)) {
    throw new InvalidArgumentError({
      argument: 'files',
      message: 'QuiverAI animate requires the input file to contain SVG data.',
    });
  }

  if (base64.length > maxAnimationSourceBase64Length) {
    throw new InvalidArgumentError({
      argument: 'files',
      message: `QuiverAI animate accepts at most ${maxAnimationSourceBase64Length} base64 characters for the source SVG.`,
    });
  }

  return { base64 };
}

function isSvg(data: Uint8Array): boolean {
  const head = new TextDecoder('utf-8', { fatal: false })
    .decode(data.subarray(0, 4096))
    .trimStart();

  return /^(?:(?:<\?xml[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[\s\S]*?>)\s*)*<svg(?:\s|>)/i.test(
    head,
  );
}

function buildRequestBody({
  modelId,
  n,
  prompt,
  files,
  mask,
  operation,
  options,
}: {
  modelId: string;
  n: number;
  prompt: string | undefined;
  files: ImageModelV4File[] | undefined;
  mask: ImageModelV4File | undefined;
  operation: QuiverAIOperation;
  options: QuiverAIImageModelOptions;
}) {
  if (
    (modelId === 'arrow-2' || modelId === 'arrow-2-telos') &&
    options.maxOutputTokens != null &&
    options.maxOutputTokens > 65536
  ) {
    throw new InvalidArgumentError({
      argument: 'maxOutputTokens',
      message: `QuiverAI model "${modelId}" supports at most 65536 output tokens.`,
    });
  }

  const sharedOptions = {
    temperature: options.temperature,
    top_p: options.topP,
    presence_penalty: options.presencePenalty,
    max_output_tokens: options.maxOutputTokens,
    reasoning_effort: options.reasoningEffort,
    attributes: options.attributes,
    stream: false as const,
  };

  if (operation === 'generate') {
    if (prompt == null || prompt.trim().length === 0) {
      throw new InvalidArgumentError({
        argument: 'prompt',
        message:
          'QuiverAI image generation requires a non-empty prompt for generateImage.',
      });
    }

    const references = files?.map(toQuiverAIImageReference);
    const maxReferences = getGenerateReferenceLimit(modelId);

    if (references != null && references.length > maxReferences) {
      throw new InvalidArgumentError({
        argument: 'files',
        message: `QuiverAI generate supports up to ${maxReferences} reference images for model "${modelId}".`,
      });
    }

    return {
      model: modelId,
      n,
      prompt,
      ...sharedOptions,
      instructions: options.instructions,
      references,
    };
  }

  if (operation === 'animate') {
    return buildAnimationRequestBody({
      modelId,
      n,
      prompt,
      files,
      mask,
      options,
    });
  }

  if (files == null || files.length === 0) {
    throw new InvalidArgumentError({
      argument: 'files',
      message:
        'QuiverAI vectorize requires an input image. Pass an image in the generateImage prompt and set providerOptions.quiverai.operation to "vectorize".',
    });
  }

  if (files.length > 1) {
    throw new InvalidArgumentError({
      argument: 'files',
      message: 'QuiverAI vectorize accepts a single input image.',
    });
  }

  if (n !== 1) {
    throw new InvalidArgumentError({
      argument: 'n',
      message:
        'QuiverAI vectorize returns one SVG per request. Set maxImagesPerCall to 1 in generateImage to vectorize multiple times.',
    });
  }

  return {
    model: modelId,
    image: toQuiverAIImageReference(files[0]),
    ...sharedOptions,
    auto_crop: options.autoCrop,
    target_size: options.targetSize,
  };
}

function buildAnimationRequestBody({
  modelId,
  n,
  prompt,
  files,
  mask,
  options,
}: {
  modelId: string;
  n: number;
  prompt: string | undefined;
  files: ImageModelV4File[] | undefined;
  mask: ImageModelV4File | undefined;
  options: QuiverAIImageModelOptions;
}) {
  if (modelId !== 'arrow-2' && modelId !== 'arrow-2-telos') {
    throw new InvalidArgumentError({
      argument: 'modelId',
      message:
        'QuiverAI animate is supported by the "arrow-2" and "arrow-2-telos" models.',
    });
  }

  if (files == null || files.length === 0) {
    throw new InvalidArgumentError({
      argument: 'files',
      message:
        'QuiverAI animate requires exactly one source SVG in prompt.images.',
    });
  }

  if (files.length !== 1) {
    throw new InvalidArgumentError({
      argument: 'files',
      message:
        'QuiverAI animate accepts exactly one source SVG in prompt.images.',
    });
  }

  if (n !== 1) {
    throw new InvalidArgumentError({
      argument: 'n',
      message:
        'QuiverAI animate returns one SVG per request. Set maxImagesPerCall to 1 in generateImage to animate multiple times.',
    });
  }

  if (mask != null) {
    throw new InvalidArgumentError({
      argument: 'mask',
      message: 'QuiverAI animate does not support masks.',
    });
  }

  if (prompt != null && prompt.trim().length === 0) {
    throw new InvalidArgumentError({
      argument: 'prompt',
      message:
        'QuiverAI animate requires a non-empty prompt when an animation instruction is provided.',
    });
  }

  const unsupportedOptions = [
    ['instructions', options.instructions],
    ['topP', options.topP],
    ['presencePenalty', options.presencePenalty],
    ['attributes', options.attributes],
    ['autoCrop', options.autoCrop],
    ['targetSize', options.targetSize],
  ].filter((option): option is [string, NonNullable<unknown>] => {
    return option[1] !== undefined;
  });

  if (unsupportedOptions.length > 0) {
    throw new InvalidArgumentError({
      argument: `providerOptions.quiverai.${unsupportedOptions[0][0]}`,
      message: `QuiverAI animate does not support providerOptions.quiverai.${unsupportedOptions[0][0]}.`,
    });
  }

  return {
    model: modelId,
    svg_source: toQuiverAIAnimationSource(files[0]),
    prompt,
    temperature: options.temperature,
    max_output_tokens: options.maxOutputTokens,
    reasoning_effort: options.reasoningEffort,
    stream: false as const,
  };
}

function collectWarnings({
  size,
  aspectRatio,
  seed,
  mask,
}: {
  size: `${number}x${number}` | undefined;
  aspectRatio: `${number}:${number}` | undefined;
  seed: number | undefined;
  mask: ImageModelV4File | undefined;
}): SharedV4Warning[] {
  const warnings: SharedV4Warning[] = [];

  if (size != null) {
    warnings.push({
      type: 'unsupported',
      feature: 'size',
      details:
        'QuiverAI SVG generation does not support the `size` option. The setting was ignored.',
    });
  }

  if (aspectRatio != null) {
    warnings.push({
      type: 'unsupported',
      feature: 'aspectRatio',
      details:
        'QuiverAI SVG generation does not support the `aspectRatio` option. The setting was ignored.',
    });
  }

  if (seed != null) {
    warnings.push({
      type: 'unsupported',
      feature: 'seed',
      details:
        'QuiverAI SVG generation does not support the `seed` option. The setting was ignored.',
    });
  }

  if (mask != null) {
    warnings.push({
      type: 'unsupported',
      feature: 'mask',
      details:
        'QuiverAI SVG generation does not support masks. The mask was ignored.',
    });
  }

  return warnings;
}

// Limited schemas focused on what is needed for the implementation.
// This approach limits breakages when the API changes and keeps the
// response handler efficient.
const svgUsageSchema = z.object({
  total_tokens: z.number().int().nonnegative(),
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
});

const svgDocumentSchema = z.object({
  svg: z.string().min(1),
  mime_type: z.literal('image/svg+xml'),
  loop_period_ms: z.number().int().nonnegative().nullish(),
  opening_animation_ms: z.number().int().nonnegative().nullish(),
});

const svgGenerationResponseSchema = z.object({
  id: z.string().min(1),
  created: z.number().int().nonnegative(),
  data: z.array(svgDocumentSchema).min(1),
  usage: svgUsageSchema.nullish(),
  credits: z.number().int().nonnegative().nullish(),
});

const quiveraiErrorSchema = z.object({
  status: z.number().int(),
  code: z.string().min(1),
  message: z.string().min(1),
  request_id: z.string().min(1),
});

export const quiveraiFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: quiveraiErrorSchema,
  errorToMessage: error => error.message,
  isRetryable: response => response.status === 429 || response.status >= 500,
});
