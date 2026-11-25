import type {
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
import type { AlibabaLanguageModelChatOptions } from './alibaba-chat-language-model-options';
import type { AlibabaEmbeddingModelOptions } from './alibaba-embedding-model-options';
import type { AlibabaVideoModelOptions } from './alibaba-video-model-options';

const alibabaEmbeddingLimits = {
  maxEmbeddingsPerCall: 10,
  supportsParallelCalls: false,
} as const;

/** Known options accepted under providerOptions; open-ended extension keys remain undeclared. */
export const alibabaProviderOptions = {
  language: {
    enableThinking: {
      description:
        'Enable thinking/reasoning mode for supported models. When enabled, the model generates reasoning content before the response.',
    },
    thinkingBudget: {
      description: 'Maximum number of reasoning tokens to generate.',
    },
    preserveThinking: {
      description:
        'Whether to preserve reasoning from previous assistant messages. When enabled, historical reasoning is sent separately as `reasoning_content` and Alibaba receives `preserve_thinking: true`. Defaults to `true` for models that support preserved thinking; set to `false` to opt out.',
    },
    parallelToolCalls: {
      description:
        'Whether to enable parallel function calling during tool use.',
    },
  } satisfies Record<
    keyof AlibabaLanguageModelChatOptions,
    ProviderOptionDefinition
  >,
  embedding: {
    textType: {
      description:
        'Differentiates query text from document text for asymmetric retrieval tasks. Defaults to `document`.',
    },
    dimension: {
      description:
        'The dimension of the output embedding vectors. Defaults to 1024. `text-embedding-v4` also supports 1536 and 2048 dimensions.',
    },
    outputType: {
      description:
        'The output vector type. Defaults to `dense`. Sparse-only output is not supported by the AI SDK embedding interface, which requires dense number arrays.',
    },
  } satisfies Record<
    keyof AlibabaEmbeddingModelOptions,
    ProviderOptionDefinition
  >,
  video: {
    negativePrompt: {
      description: 'Negative prompt to specify what to avoid (max 500 chars).',
    },
    audioUrl: {
      description:
        'URL to audio file for audio-video sync (WAV/MP3, 3-30s, max 15MB).',
    },
    promptExtend: {
      description:
        'Enable prompt extension/rewriting for better generation. Defaults to true.',
    },
    shotType: {
      description:
        "Shot type: 'single' for single-shot or 'multi' for multi-shot narrative (wan2.6 and earlier; wan2.7 models describe shot structure in the prompt).",
    },
    watermark: {
      description:
        'Whether to add watermark to generated video. Defaults to false.',
    },
    audio: {
      description:
        'Enable audio generation (wan2.6 I2V/R2V and wan3 models; wan2.7 models always generate audio). Defaults to true on wan3.',
    },
    referenceUrls: {
      description:
        'Reference URLs for reference-to-video mode (wan2.6 models). Array of URLs to images (0-5) and/or videos (0-3), max 5 total. Use character identifiers (character1, character2) in prompts to reference them.',
    },
    media: {
      description:
        'Explicit media array (wan2.7 and wan3 models). Overrides the automatic mapping from `inputReferences` and `frameImages`. Use `Image 1`, `Video 1`, etc. in prompts to reference media items (images, videos, and audio are counted separately, in array order). `reference_audio`, `file`, and `link` are wan3-only and have no top-level call option, so they can only be passed here. wan3 also rejects mixing `reference_*`/`file`/`link` with `first_frame`/`last_frame`.',
    },
    ratio: {
      description:
        'Aspect ratio (wan2.7 text-to-video and reference-to-video models, and every wan3 generation). `adaptive` is wan3-only, and is its default.',
    },
    pollIntervalMs: {
      description:
        'Polling interval in milliseconds. Defaults to 5000 (5 seconds).',
    },
    pollTimeoutMs: {
      description:
        'Maximum wait time in milliseconds for video generation. Defaults to 600000 (10 minutes).',
    },
  } satisfies Record<keyof AlibabaVideoModelOptions, ProviderOptionDefinition>,
} as const satisfies ProviderOptionDefinitions;

/*
 * Every model type below has the same layout: the row type, the matrix (model
 * IDs by capability), the builder that turns a row into a catalog entry, and
 * the fallback for model IDs that are not listed.
 *
 * A row is flat and every listed model fills in every cell. Nothing in a row
 * is derived from the model ID. The fallbacks for unlisted model IDs are the
 * only places that look at the model ID.
 */

// Language models

/** One row of the language model matrix. */
export type AlibabaLanguageModelRow = {
  /**
   * `false` keeps a known model ID out of the exported catalog and the
   * generated documentation.
   */
  documented: boolean;
  /**
   * Supports preserved thinking (`preserve_thinking`), which replays the
   * `reasoning_content` of previous assistant turns.
   * https://docs.qwencloud.com/developer-guides/text-generation/thinking#preserve-thinking-in-multi-turn
   */
  preservedThinking: boolean;
  /**
   * Supports JSON schema structured output.
   * https://www.alibabacloud.com/help/en/model-studio/qwen-structured-output#supported-models
   */
  jsonSchema: boolean;
};

/**
 * Language model matrix: model IDs by capability. To add a model, add a row
 * and fill in every column.
 */
const languageModelDefinitions = {
  'qwen3.7-max': {
    documented: true,
    preservedThinking: true,
    jsonSchema: true,
  },
  'qwen3-max': {
    documented: true,
    preservedThinking: false,
    jsonSchema: false,
  },
  'qwen3-max-preview': {
    documented: true,
    preservedThinking: false,
    jsonSchema: false,
  },
  'qwen-plus': {
    documented: true,
    preservedThinking: false,
    jsonSchema: false,
  },
  'qwen-plus-latest': {
    documented: true,
    preservedThinking: false,
    jsonSchema: false,
  },
  'qwen-flash': {
    documented: true,
    preservedThinking: false,
    jsonSchema: false,
  },
  'qwen-turbo': {
    documented: true,
    preservedThinking: false,
    jsonSchema: false,
  },
  'qwen-turbo-latest': {
    documented: true,
    preservedThinking: false,
    jsonSchema: false,
  },
  'qwen3-235b-a22b': {
    documented: true,
    preservedThinking: false,
    jsonSchema: false,
  },
  'qwen3-32b': {
    documented: true,
    preservedThinking: false,
    jsonSchema: false,
  },
  'qwen3-30b-a3b': {
    documented: true,
    preservedThinking: false,
    jsonSchema: false,
  },
  'qwen3-14b': {
    documented: true,
    preservedThinking: false,
    jsonSchema: false,
  },
  'qwen3-next-80b-a3b-thinking': {
    documented: true,
    preservedThinking: false,
    jsonSchema: false,
  },
  'qwen3-235b-a22b-thinking-2507': {
    documented: true,
    preservedThinking: false,
    jsonSchema: false,
  },
  'qwen3-30b-a3b-thinking-2507': {
    documented: true,
    preservedThinking: false,
    jsonSchema: false,
  },
  'qwq-plus': {
    documented: true,
    preservedThinking: false,
    jsonSchema: false,
  },
  'qwq-plus-latest': {
    documented: true,
    preservedThinking: false,
    jsonSchema: false,
  },
  'qwq-32b': {
    documented: true,
    preservedThinking: false,
    jsonSchema: false,
  },
  'qwen-coder': {
    documented: true,
    preservedThinking: false,
    jsonSchema: false,
  },
  'qwen3-coder-plus': {
    documented: true,
    preservedThinking: false,
    jsonSchema: false,
  },
  'qwen3-coder-flash': {
    documented: true,
    preservedThinking: false,
    jsonSchema: false,
  },
  'kimi-k2.7-code': {
    documented: false,
    preservedThinking: true,
    jsonSchema: false,
  },
  'qwen3.6-max-preview': {
    documented: false,
    preservedThinking: true,
    jsonSchema: false,
  },
  'qwen3.6-plus': {
    documented: false,
    preservedThinking: true,
    jsonSchema: false,
  },
  'qwen3.6-plus-2026-04-02': {
    documented: false,
    preservedThinking: true,
    jsonSchema: false,
  },
  'qwen3.7-flash': {
    documented: false,
    preservedThinking: true,
    jsonSchema: true,
  },
  'qwen3.7-flash-2026-07-15': {
    documented: false,
    preservedThinking: true,
    jsonSchema: true,
  },
  'qwen3.7-max-2026-05-17': {
    documented: false,
    preservedThinking: true,
    jsonSchema: true,
  },
  'qwen3.7-max-2026-05-20': {
    documented: false,
    preservedThinking: true,
    jsonSchema: true,
  },
  'qwen3.7-max-2026-06-08': {
    documented: false,
    preservedThinking: true,
    jsonSchema: true,
  },
  'qwen3.7-max-preview': {
    documented: false,
    preservedThinking: true,
    jsonSchema: true,
  },
  'qwen3.7-plus': {
    documented: false,
    preservedThinking: true,
    jsonSchema: true,
  },
  'qwen3.7-plus-2026-05-26': {
    documented: false,
    preservedThinking: true,
    jsonSchema: true,
  },
  'qwen3.8-flash': {
    documented: false,
    preservedThinking: true,
    jsonSchema: true,
  },
  'qwen3.8-max': {
    documented: false,
    preservedThinking: true,
    jsonSchema: true,
  },
  'qwen3.8-max-0902': {
    documented: false,
    preservedThinking: true,
    jsonSchema: true,
  },
} satisfies Record<string, AlibabaLanguageModelRow>;

/** Maps a matrix row to its entry. Nothing here inspects the model ID. */
function createLanguageModelEntry(row: AlibabaLanguageModelRow) {
  const entry = {
    capabilities: {
      language: {
        inputs: { image: 'unknown', audio: false },
        objectGeneration: true,
        tools: { usage: true, streaming: true },
        reasoning: { support: 'unknown', preserved: row.preservedThinking },
        sampling: { temperature: true, topP: true, logprobs: false },
        structuredOutput: { jsonSchema: row.jsonSchema },
      },
    },
    providerOptions: {
      language: {
        enableThinking: 'unknown',
        thinkingBudget: 'unknown',
        preserveThinking: row.preservedThinking,
        parallelToolCalls: true,
      },
    },
  } as const;
  return entry satisfies ModelEntry;
}

const languageModelRows = Object.entries<AlibabaLanguageModelRow>(
  languageModelDefinitions,
);

/** Entries for every listed model ID, documented or not. */
const listedLanguageModelEntries = Object.fromEntries(
  languageModelRows.map(([modelId, row]) => [
    modelId,
    createLanguageModelEntry(row),
  ]),
);

/**
 * Returns the entry of a listed language model ID from its row. Every other
 * model ID uses the fallback for unlisted IDs.
 */
export function getAlibabaLanguageModelEntry(modelId: string) {
  return Object.prototype.hasOwnProperty.call(
    listedLanguageModelEntries,
    modelId,
  )
    ? listedLanguageModelEntries[modelId]
    : createLanguageModelEntry(getUnlistedLanguageModelRow(modelId));
}

// Model families with JSON schema structured output. Used only for model IDs
// that are not listed in the matrix, such as dated snapshots.
const unlistedJsonSchemaModelPrefixes = [
  'qwen3.7-plus',
  'qwen3.7-flash',
  'qwen3.7-max',
  'qwen3.8-max',
  'qwen3.8-flash',
];

/** Resolves a language model ID that is not listed in the matrix to a row. */
function getUnlistedLanguageModelRow(modelId: string): AlibabaLanguageModelRow {
  return {
    documented: false,
    preservedThinking: false,
    jsonSchema: unlistedJsonSchemaModelPrefixes.some(
      prefix => modelId === prefix || modelId.startsWith(`${prefix}-`),
    ),
  };
}

// Embedding models

/** One row of the embedding model matrix. */
export type AlibabaEmbeddingModelRow = {
  dimensions: readonly number[];
};

const embeddingModelDefinitions = {
  'text-embedding-v4': {
    dimensions: [64, 128, 256, 512, 768, 1024, 1536, 2048],
  },
  'text-embedding-v3': { dimensions: [512, 768, 1024] },
} satisfies Record<string, AlibabaEmbeddingModelRow>;

/**
 * Maps a matrix row to its entry. Without a row (the model ID is not listed)
 * no embedding capabilities are declared.
 */
function createEmbeddingModelEntry(row: AlibabaEmbeddingModelRow | undefined) {
  const entry = {
    capabilities: {
      ...(row != null
        ? {
            embedding: {
              defaultDimensions: 1024,
              ...alibabaEmbeddingLimits,
              customDimensions: true,
              dimensions: row.dimensions,
            },
          }
        : {}),
    },
    providerOptions: {
      embedding: Object.fromEntries(
        Object.keys(alibabaProviderOptions.embedding).map(key => [key, true]),
      ),
    },
    requestConfig: {
      embedding: alibabaEmbeddingLimits,
    },
  } as const;
  return entry satisfies ModelEntry<{
    embedding: { maxEmbeddingsPerCall: number; supportsParallelCalls: boolean };
  }>;
}

export function getAlibabaEmbeddingModelEntry(modelId: string) {
  return createEmbeddingModelEntry(
    Object.prototype.hasOwnProperty.call(embeddingModelDefinitions, modelId)
      ? embeddingModelDefinitions[
          modelId as keyof typeof embeddingModelDefinitions
        ]
      : undefined,
  );
}

// Video models

/**
 * Request protocol of a video model:
 * - `legacy` (wan2.6 and earlier): `parameters.size`, `input.img_url`, and
 *   `input.reference_urls`.
 * - `wan27`: resolution tiers and `ratio` instead of `size`, `input.media`
 *   instead of `input.reference_urls`, no `shot_type`, audio always on.
 * - `wan3`: like `wan27`, plus a real `last_frame` slot, an `audio` toggle,
 *   a 480P tier, and one model ID covering every mode.
 */
type AlibabaVideoProtocol = 'legacy' | 'wan27' | 'wan3';

/** Text-to-video, image-to-video, or reference-to-video. */
type AlibabaVideoMode = 't2v' | 'i2v' | 'r2v';

/**
 * One row of the video model matrix. The protocol and the mode together
 * decide which inputs and provider options a model accepts.
 */
export type AlibabaVideoModelRow = {
  protocol: AlibabaVideoProtocol;
  /**
   * The mode a model ID is fixed to. A `wan3` model takes its mode from the
   * media of the request instead, and its row uses `t2v`.
   */
  mode: AlibabaVideoMode;
  /** Documented audio generation. `undefined`: not documented. */
  audioMode: string | undefined;
  /** Documented resolution tiers. `undefined`: not documented. */
  resolutionTiers: readonly string[] | undefined;
  /** Documented duration range. `undefined`: not documented. */
  durationRange: string | undefined;
};

const videoModelDefinitions = {
  'wan2.6-t2v': {
    protocol: 'legacy',
    mode: 't2v',
    audioMode: 'Yes',
    resolutionTiers: ['720P', '1080P'],
    durationRange: '2-15s',
  },
  'wan2.5-t2v-preview': {
    protocol: 'legacy',
    mode: 't2v',
    audioMode: 'Yes',
    resolutionTiers: ['480P', '720P', '1080P'],
    durationRange: '5s, 10s',
  },
  'wan2.7-t2v': {
    protocol: 'wan27',
    mode: 't2v',
    audioMode: 'Yes',
    resolutionTiers: ['720P', '1080P'],
    durationRange: '2-15s',
  },
  'wan2.7-t2v-2026-06-12': {
    protocol: 'wan27',
    mode: 't2v',
    audioMode: 'Yes',
    resolutionTiers: ['720P', '1080P'],
    durationRange: '2-15s',
  },
  'wan2.6-i2v': {
    protocol: 'legacy',
    mode: 'i2v',
    audioMode: 'Yes',
    resolutionTiers: ['720P', '1080P'],
    durationRange: '2-15s',
  },
  'wan2.6-i2v-flash': {
    protocol: 'legacy',
    mode: 'i2v',
    audioMode: 'Optional',
    resolutionTiers: ['720P', '1080P'],
    durationRange: '2-15s',
  },
  'wan2.6-r2v': {
    protocol: 'legacy',
    mode: 'r2v',
    audioMode: 'Yes',
    resolutionTiers: ['720P', '1080P'],
    durationRange: '2-10s',
  },
  'wan2.6-r2v-flash': {
    protocol: 'legacy',
    mode: 'r2v',
    audioMode: 'Optional',
    resolutionTiers: ['720P', '1080P'],
    durationRange: '2-10s',
  },
  'wan2.7-r2v': {
    protocol: 'wan27',
    mode: 'r2v',
    audioMode: 'Yes',
    resolutionTiers: ['720P', '1080P'],
    durationRange: '2-10s (with video ref), 2-15s',
  },
  'wan2.7-r2v-2026-06-12': {
    protocol: 'wan27',
    mode: 'r2v',
    audioMode: 'Yes',
    resolutionTiers: ['720P', '1080P'],
    durationRange: '2-10s (with video ref), 2-15s',
  },
  'wan3.0-video': {
    protocol: 'wan3',
    mode: 't2v',
    audioMode: undefined,
    resolutionTiers: undefined,
    durationRange: undefined,
  },
} satisfies Record<string, AlibabaVideoModelRow>;

/** Maps a matrix row to its entry. Nothing here inspects the model ID. */
function createVideoModelEntry(row: AlibabaVideoModelRow) {
  const { mode, protocol } = row;
  const latest = protocol === 'wan3',
    tiered = protocol !== 'legacy';
  const entry = {
    capabilities: {
      video: {
        inputs: {
          text: true,
          image: latest || mode === 'i2v',
          firstFrame:
            latest ||
            mode === 'i2v' ||
            (protocol === 'wan27' && mode === 'r2v'),
          lastFrame: latest,
          referenceImage: latest || mode === 'r2v',
          referenceVideo: latest || mode === 'r2v',
        },
        generateAudio: true,
        aspectRatio: latest || (protocol === 'wan27' && mode !== 'i2v'),
        resolution: true,
        duration: true,
        fps: false,
        seed: true,
        maxVideosPerCall: 1,
        ...(row.audioMode != null ? { audioMode: row.audioMode } : {}),
        ...(row.resolutionTiers != null
          ? { resolutionTiers: row.resolutionTiers }
          : {}),
        ...(row.durationRange != null
          ? { durationRange: row.durationRange }
          : {}),
      },
    },
    providerOptions: {
      video: {
        ...Object.fromEntries(
          Object.keys(alibabaProviderOptions.video).map(key => [key, true]),
        ),
        shotType: !tiered,
        audio: protocol !== 'wan27',
        media: tiered,
        ratio: latest || (protocol === 'wan27' && mode !== 'i2v'),
        referenceUrls: {
          condition:
            'Reference-to-video generation using the legacy media protocol.',
        },
      },
    },
    requestConfig: { video: { mode, protocol } },
  } as const;
  return entry satisfies ModelEntry<{
    video: { mode: AlibabaVideoMode; protocol: AlibabaVideoProtocol };
  }>;
}

export function getAlibabaVideoModelEntry(modelId: string) {
  return createVideoModelEntry(
    Object.prototype.hasOwnProperty.call(videoModelDefinitions, modelId)
      ? videoModelDefinitions[modelId as keyof typeof videoModelDefinitions]
      : getUnlistedVideoModelRow(modelId),
  );
}

/**
 * Resolves a video model ID that is not listed in the matrix to a row, from
 * the mode and the version that the model ID names.
 */
function getUnlistedVideoModelRow(modelId: string): AlibabaVideoModelRow {
  return {
    protocol: getUnlistedVideoProtocol(modelId),
    mode: modelId.includes('-i2v')
      ? 'i2v'
      : modelId.includes('-r2v')
        ? 'r2v'
        : 't2v',
    audioMode: undefined,
    resolutionTiers: undefined,
    durationRange: undefined,
  };
}

function getUnlistedVideoProtocol(modelId: string): AlibabaVideoProtocol {
  // `wanx` is the older id prefix (e.g. `wanx2.1-t2v-turbo`).
  const version = /^wanx?(\d+)(?:\.(\d+))?(?=[.-]|$)/.exec(modelId);
  if (version != null) {
    const major = Number(version[1]);
    const minor = Number(version[2] ?? 0);
    if (major < 2 || (major === 2 && minor < 7)) return 'legacy';
    if (major === 2) return 'wan27';
  }

  // Unrecognized IDs inherit the latest all-in-one media protocol.
  return 'wan3';
}

export const alibabaModelCatalog = Object.fromEntries([
  ...languageModelRows
    .filter(([, row]) => row.documented)
    .map(([id]) => [id, listedLanguageModelEntries[id]] as const),
  ...Object.keys(embeddingModelDefinitions).map(
    id => [id, getAlibabaEmbeddingModelEntry(id)] as const,
  ),
  ...Object.keys(videoModelDefinitions).map(
    id => [id, getAlibabaVideoModelEntry(id)] as const,
  ),
]);

type DocumentedLanguageModelId = {
  [ModelId in keyof typeof languageModelDefinitions]: (typeof languageModelDefinitions)[ModelId]['documented'] extends true
    ? ModelId
    : never;
}[keyof typeof languageModelDefinitions];

/** Known model IDs, derived from the matrices used to build the catalog. */
export type AlibabaModelIds = {
  language: DocumentedLanguageModelId;
  embedding: keyof typeof embeddingModelDefinitions;
  video: keyof typeof videoModelDefinitions;
};
