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
import {
  validateQuiverAIImageUrl,
  validateQuiverAIReferenceBase64,
} from './prepare-quiverai-image-reference';
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
    case 'edit':
      return '/svgs/edits';
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
    rejectEditOnlyOptions(operation, options);

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

  if (operation === 'edit') {
    return buildEditRequestBody({
      modelId,
      n,
      prompt,
      files,
      mask,
      options,
    });
  }

  rejectEditOnlyOptions(operation, options);

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

const editModelIds = new Set(['arrow-2', 'arrow-2-telos']);
const MAX_EDIT_SVG_BYTES = 200_000;

function buildEditRequestBody({
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
  if (!editModelIds.has(modelId)) {
    throw new InvalidArgumentError({
      argument: 'modelId',
      message:
        'QuiverAI SVG editing is supported by the "arrow-2" and "arrow-2-telos" models.',
    });
  }

  if (prompt == null || prompt.trim().length === 0) {
    throw new InvalidArgumentError({
      argument: 'prompt',
      message:
        'QuiverAI SVG editing requires a non-empty instruction in generateImage prompt.text.',
    });
  }

  if (prompt.length > 4000) {
    throw new InvalidArgumentError({
      argument: 'prompt',
      message:
        'QuiverAI SVG editing instructions must contain at most 4000 characters.',
    });
  }

  if (files == null || files.length === 0) {
    throw new InvalidArgumentError({
      argument: 'files',
      message:
        'QuiverAI SVG editing requires one source SVG in generateImage prompt.images.',
    });
  }

  if (files.length !== 1) {
    throw new InvalidArgumentError({
      argument: 'files',
      message: 'QuiverAI SVG editing accepts exactly one source SVG.',
    });
  }

  if (n !== 1) {
    throw new InvalidArgumentError({
      argument: 'n',
      message: 'QuiverAI SVG editing returns exactly one SVG per request.',
    });
  }

  if (mask != null) {
    throw new InvalidArgumentError({
      argument: 'mask',
      message: 'QuiverAI SVG editing does not support masks.',
    });
  }

  const unsupportedOptions = [
    ['instructions', options.instructions],
    ['attributes', options.attributes],
    ['topP', options.topP],
    ['presencePenalty', options.presencePenalty],
    ['autoCrop', options.autoCrop],
    ['targetSize', options.targetSize],
  ].flatMap(([name, value]) => (value == null ? [] : [name]));

  if (unsupportedOptions.length > 0) {
    throw new InvalidArgumentError({
      argument: 'providerOptions',
      message: `QuiverAI SVG editing does not support these provider options: ${unsupportedOptions.join(
        ', ',
      )}.`,
    });
  }

  const referenceImages = options.referenceImages?.map((reference, index) => {
    if ('url' in reference) {
      return {
        url: validateQuiverAIImageUrl(reference.url),
      };
    }

    validateQuiverAIReferenceBase64(
      reference.base64,
      `providerOptions.quiverai.referenceImages[${index}]`,
    );
    return { base64: reference.base64 };
  });
  const settings = {
    max_output_tokens: options.maxOutputTokens,
    orchestrator_max_output_tokens: options.orchestratorMaxOutputTokens,
    shallow_max_output_tokens: options.shallowMaxOutputTokens,
    temperature: options.temperature,
  };
  const hasSettings = Object.values(settings).some(value => value != null);

  return {
    model: modelId,
    prompt,
    ...toQuiverAIEditSource(files[0]),
    reference_images: referenceImages,
    max_review_steps: options.maxReviewSteps,
    reasoning_effort: options.reasoningEffort,
    ...(hasSettings && { settings }),
    stream: false as const,
  };
}

function rejectEditOnlyOptions(
  operation: Exclude<QuiverAIOperation, 'edit'>,
  options: QuiverAIImageModelOptions,
) {
  const editOnlyOptions = [
    ['referenceImages', options.referenceImages],
    ['maxReviewSteps', options.maxReviewSteps],
    ['orchestratorMaxOutputTokens', options.orchestratorMaxOutputTokens],
    ['shallowMaxOutputTokens', options.shallowMaxOutputTokens],
  ].flatMap(([name, value]) => (value == null ? [] : [name]));

  if (editOnlyOptions.length > 0) {
    throw new InvalidArgumentError({
      argument: 'providerOptions',
      message: `QuiverAI ${operation} does not support these edit-only provider options: ${editOnlyOptions.join(
        ', ',
      )}.`,
    });
  }
}

function toQuiverAIEditSource(file: ImageModelV4File) {
  if (file.type === 'url') {
    return {
      svg_source: {
        url: validateQuiverAIImageUrl(file.url),
      },
    };
  }

  let data: Uint8Array;
  try {
    data =
      typeof file.data === 'string'
        ? convertBase64ToUint8Array(file.data)
        : file.data;
  } catch (cause) {
    throw new InvalidArgumentError({
      argument: 'files',
      message: 'QuiverAI SVG source data must be valid base64 or binary data.',
      cause,
    });
  }

  if (data.length === 0 || data.length > MAX_EDIT_SVG_BYTES) {
    throw new InvalidArgumentError({
      argument: 'files',
      message: `QuiverAI SVG source data must contain 1-${MAX_EDIT_SVG_BYTES} bytes.`,
    });
  }

  let svg: string;
  try {
    svg = new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch (cause) {
    throw new InvalidArgumentError({
      argument: 'files',
      message: 'QuiverAI SVG source data must be valid UTF-8.',
      cause,
    });
  }

  if (svg.length > MAX_EDIT_SVG_BYTES || !isSvgMarkup(svg)) {
    throw new InvalidArgumentError({
      argument: 'files',
      message: 'QuiverAI SVG source data must contain a complete SVG document.',
    });
  }

  return {
    svg_source: {
      base64: convertUint8ArrayToBase64(data),
    },
  };
}

function isSvgMarkup(svg: string) {
  const normalized = svg.replace(/^\uFEFF/, '').trim();
  return (
    /^(?:<\?xml[\s\S]*?\?>\s*)?(?:<!--[\s\S]*?-->\s*)?(?:<!DOCTYPE[\s\S]*?>\s*)?<svg[\s>]/i.test(
      normalized,
    ) &&
    (/<\/svg>\s*$/i.test(normalized) ||
      /<svg(?:\s[^>]*)?\/>\s*$/is.test(normalized))
  );
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
