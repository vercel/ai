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
import { quiveraiFailedResponseHandler } from './quiverai-error';
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
    case 'edit':
      return '/svgs/edits';
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

  if (operation !== 'edit') {
    rejectEditOnlyOptions(operation, options);
  }

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
      message:
        'QuiverAI SVG editing returns exactly one SVG per request. Set maxImagesPerCall to 1 in generateImage to edit multiple times.',
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
  const document = svg.replace(/^\uFEFF/, '');
  const elements: string[] = [];
  let position = 0;
  let rootSeen = false;
  let rootClosed = false;
  let doctypeSeen = false;

  while (position < document.length) {
    if (document[position] !== '<') {
      const nextTag = document.indexOf('<', position);
      const end = nextTag === -1 ? document.length : nextTag;
      const text = document.slice(position, end);

      if (
        (elements.length === 0 && text.trim().length > 0) ||
        text.includes(']]>') ||
        !hasValidXmlReferences(text)
      ) {
        return false;
      }

      position = end;
      continue;
    }

    if (document.startsWith('<!--', position)) {
      const commentEnd = document.indexOf('-->', position + 4);
      if (
        commentEnd === -1 ||
        document.slice(position + 4, commentEnd).includes('--')
      ) {
        return false;
      }
      position = commentEnd + 3;
      continue;
    }

    if (document.startsWith('<?', position)) {
      const instructionEnd = document.indexOf('?>', position + 2);
      if (instructionEnd === -1) {
        return false;
      }
      position = instructionEnd + 2;
      continue;
    }

    if (document.startsWith('<![CDATA[', position)) {
      if (elements.length === 0) {
        return false;
      }
      const cdataEnd = document.indexOf(']]>', position + 9);
      if (cdataEnd === -1) {
        return false;
      }
      position = cdataEnd + 3;
      continue;
    }

    if (document.slice(position, position + 9).toUpperCase() === '<!DOCTYPE') {
      if (
        rootSeen ||
        doctypeSeen ||
        elements.length > 0 ||
        !/[\t\n\r ]/.test(document[position + 9] ?? '')
      ) {
        return false;
      }
      const doctypeName = readXmlName(
        document,
        skipXmlWhitespace(document, position + 9),
      );
      if (doctypeName?.name.toLowerCase() !== 'svg') {
        return false;
      }
      const doctypeEnd = findDoctypeEnd(document, doctypeName.end);
      if (doctypeEnd === -1) {
        return false;
      }
      doctypeSeen = true;
      position = doctypeEnd;
      continue;
    }

    if (document.startsWith('<!', position)) {
      return false;
    }

    if (document.startsWith('</', position)) {
      const closingTag = readXmlName(document, position + 2);
      if (closingTag == null) {
        return false;
      }
      let tagEnd = skipXmlWhitespace(document, closingTag.end);
      if (document[tagEnd] !== '>') {
        return false;
      }
      const expectedTag = elements.pop();
      if (expectedTag !== closingTag.name) {
        return false;
      }
      tagEnd += 1;
      if (elements.length === 0) {
        rootClosed = true;
      }
      position = tagEnd;
      continue;
    }

    if (rootClosed) {
      return false;
    }

    const openingTag = readXmlName(document, position + 1);
    if (openingTag == null) {
      return false;
    }
    if (!rootSeen) {
      if (openingTag.name.toLowerCase() !== 'svg') {
        return false;
      }
      rootSeen = true;
    }

    const attributes = new Set<string>();
    let tagPosition = openingTag.end;
    while (tagPosition < document.length) {
      const beforeWhitespace = tagPosition;
      tagPosition = skipXmlWhitespace(document, tagPosition);

      if (document.startsWith('/>', tagPosition)) {
        tagPosition += 2;
        if (elements.length === 0) {
          rootClosed = true;
        }
        position = tagPosition;
        break;
      }

      if (document[tagPosition] === '>') {
        elements.push(openingTag.name);
        position = tagPosition + 1;
        break;
      }

      if (tagPosition === beforeWhitespace) {
        return false;
      }

      const attribute = readXmlName(document, tagPosition);
      if (attribute == null || attributes.has(attribute.name)) {
        return false;
      }
      attributes.add(attribute.name);

      tagPosition = skipXmlWhitespace(document, attribute.end);
      if (document[tagPosition] !== '=') {
        return false;
      }
      tagPosition = skipXmlWhitespace(document, tagPosition + 1);

      const quote = document[tagPosition];
      if (quote !== '"' && quote !== "'") {
        return false;
      }
      const valueEnd = document.indexOf(quote, tagPosition + 1);
      if (
        valueEnd === -1 ||
        document.slice(tagPosition + 1, valueEnd).includes('<') ||
        !hasValidXmlReferences(document.slice(tagPosition + 1, valueEnd))
      ) {
        return false;
      }
      tagPosition = valueEnd + 1;
    }

    if (tagPosition >= document.length && position !== document.length) {
      return false;
    }
  }

  return rootSeen && rootClosed && elements.length === 0;
}

function isXmlNameStart(character: string | undefined) {
  return character != null && /[A-Z_a-z:\u0080-\uFFFF]/.test(character);
}

function isXmlNameCharacter(character: string | undefined) {
  return (
    character != null && /[-.0-9A-Z_a-z:\u00B7\u0080-\uFFFF]/.test(character)
  );
}

function readXmlName(value: string, position: number) {
  if (!isXmlNameStart(value[position])) {
    return undefined;
  }

  const start = position;
  position += 1;
  while (isXmlNameCharacter(value[position])) {
    position += 1;
  }

  return {
    name: value.slice(start, position),
    end: position,
  };
}

function skipXmlWhitespace(value: string, position: number) {
  while (/[\t\n\r ]/.test(value[position] ?? '')) {
    position += 1;
  }
  return position;
}

function hasValidXmlReferences(value: string) {
  let position = value.indexOf('&');
  while (position !== -1) {
    const end = value.indexOf(';', position + 1);
    if (end === -1) {
      return false;
    }
    const reference = value.slice(position + 1, end);
    if (
      !/^#\d+$/.test(reference) &&
      !/^#x[\dA-Fa-f]+$/.test(reference) &&
      !/^[A-Z_a-z:\u0080-\uFFFF][-.0-9A-Z_a-z:\u00B7\u0080-\uFFFF]*$/.test(
        reference,
      )
    ) {
      return false;
    }
    position = value.indexOf('&', end + 1);
  }
  return true;
}

function findDoctypeEnd(value: string, position: number) {
  let subsetDepth = 0;
  let quote: '"' | "'" | undefined;

  while (position < value.length) {
    const character = value[position];
    if (quote != null) {
      if (character === quote) {
        quote = undefined;
      }
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '[') {
      subsetDepth += 1;
    } else if (character === ']') {
      if (subsetDepth === 0) {
        return -1;
      }
      subsetDepth -= 1;
    } else if (character === '>' && subsetDepth === 0) {
      return position + 1;
    }
    position += 1;
  }

  return -1;
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
