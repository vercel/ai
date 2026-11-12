import type {
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
import type { AlibabaLanguageModelChatOptions } from './alibaba-chat-language-model-options';
import type { AlibabaEmbeddingModelOptions } from './alibaba-embedding-model-options';
import type { AlibabaVideoModelOptions } from './alibaba-video-model-options';
const documentedVideoDetails: Partial<
  Record<
    string,
    {
      audioMode: string;
      resolutionTiers: readonly string[];
      durationRange: string;
    }
  >
> = {
  'wan2.6-t2v': {
    audioMode: 'Yes',
    resolutionTiers: ['720P', '1080P'],
    durationRange: '2-15s',
  },
  'wan2.5-t2v-preview': {
    audioMode: 'Yes',
    resolutionTiers: ['480P', '720P', '1080P'],
    durationRange: '5s, 10s',
  },
  'wan2.7-t2v': {
    audioMode: 'Yes',
    resolutionTiers: ['720P', '1080P'],
    durationRange: '2-15s',
  },
  'wan2.7-t2v-2026-06-12': {
    audioMode: 'Yes',
    resolutionTiers: ['720P', '1080P'],
    durationRange: '2-15s',
  },
  'wan2.6-i2v-flash': {
    audioMode: 'Optional',
    resolutionTiers: ['720P', '1080P'],
    durationRange: '2-15s',
  },
  'wan2.6-i2v': {
    audioMode: 'Yes',
    resolutionTiers: ['720P', '1080P'],
    durationRange: '2-15s',
  },
  'wan2.6-r2v-flash': {
    audioMode: 'Optional',
    resolutionTiers: ['720P', '1080P'],
    durationRange: '2-10s',
  },
  'wan2.6-r2v': {
    audioMode: 'Yes',
    resolutionTiers: ['720P', '1080P'],
    durationRange: '2-10s',
  },
  'wan2.7-r2v': {
    audioMode: 'Yes',
    resolutionTiers: ['720P', '1080P'],
    durationRange: '2-10s (with video ref), 2-15s',
  },
  'wan2.7-r2v-2026-06-12': {
    audioMode: 'Yes',
    resolutionTiers: ['720P', '1080P'],
    durationRange: '2-10s (with video ref), 2-15s',
  },
};
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

const languageModelIds = [
  'qwen3.7-max',
  'qwen3-max',
  'qwen3-max-preview',
  'qwen-plus',
  'qwen-plus-latest',
  'qwen-flash',
  'qwen-turbo',
  'qwen-turbo-latest',
  'qwen3-235b-a22b',
  'qwen3-32b',
  'qwen3-30b-a3b',
  'qwen3-14b',
  'qwen3-next-80b-a3b-thinking',
  'qwen3-235b-a22b-thinking-2507',
  'qwen3-30b-a3b-thinking-2507',
  'qwq-plus',
  'qwq-plus-latest',
  'qwq-32b',
  'qwen-coder',
  'qwen3-coder-plus',
  'qwen3-coder-flash',
] as const;
const embeddingModelIds = ['text-embedding-v4', 'text-embedding-v3'] as const;
const videoModelIds = [
  'wan2.6-t2v',
  'wan2.5-t2v-preview',
  'wan2.7-t2v',
  'wan2.7-t2v-2026-06-12',
  'wan2.6-i2v',
  'wan2.6-i2v-flash',
  'wan2.6-r2v',
  'wan2.6-r2v-flash',
  'wan2.7-r2v',
  'wan2.7-r2v-2026-06-12',
  'wan3.0-video',
] as const;
// https://www.alibabacloud.com/help/en/model-studio/qwen-structured-output#supported-models
const JSON_SCHEMA_MODEL_PREFIXES = [
  'qwen3.7-plus',
  'qwen3.7-flash',
  'qwen3.7-max',
  'qwen3.8-max',
  'qwen3.8-flash',
];

function supportsJsonSchemaOutput(modelId: string): boolean {
  return JSON_SCHEMA_MODEL_PREFIXES.some(
    prefix => modelId === prefix || modelId.startsWith(`${prefix}-`),
  );
}

/**
 * Whether a model id supports Alibaba's preserved-thinking mode
 * (`preserve_thinking`), which replays assistant `reasoning_content` from
 * previous turns.
 *
 * Supported models per Alibaba's documentation:
 * https://docs.qwencloud.com/developer-guides/text-generation/thinking#preserve-thinking-in-multi-turn
 */
const preservedThinkingModelIds = new Set([
  'kimi-k2.7-code',
  'qwen3.6-max-preview',
  'qwen3.6-plus',
  'qwen3.6-plus-2026-04-02',
  'qwen3.7-flash',
  'qwen3.7-flash-2026-07-15',
  'qwen3.7-max',
  'qwen3.7-max-2026-05-17',
  'qwen3.7-max-2026-05-20',
  'qwen3.7-max-2026-06-08',
  'qwen3.7-max-preview',
  'qwen3.7-plus',
  'qwen3.7-plus-2026-05-26',
  'qwen3.8-flash',
  'qwen3.8-max',
  'qwen3.8-max-0902',
]);

function supportsPreservedThinking(modelId: string): boolean {
  return preservedThinkingModelIds.has(modelId);
}

// Only meaningful for ids that name their mode (wan2.6/wan2.7). wan3 ships a
// single all-in-one id, so its mode comes from the media the request carries.
function detectMode(modelId: string): 't2v' | 'i2v' | 'r2v' {
  if (modelId.includes('-i2v')) return 'i2v';
  if (modelId.includes('-r2v')) return 'r2v';
  return 't2v';
}

/**
 * Request protocol, selected by model id:
 * - `legacy` (wan2.6 and earlier): `parameters.size`, `input.img_url`, and
 *   `input.reference_urls`.
 * - `wan27`: resolution tiers and `ratio` instead of `size`, `input.media`
 *   instead of `input.reference_urls`, no `shot_type`, audio always on.
 * - `wan3`: like `wan27`, plus a real `last_frame` slot, an `audio` toggle,
 *   a 480P tier, and one id covering every mode.
 */
type AlibabaVideoProtocol = 'legacy' | 'wan27' | 'wan3';

function detectProtocol(modelId: string): AlibabaVideoProtocol {
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

export function getAlibabaLanguageModelEntry(modelId: string) {
  const preserved = supportsPreservedThinking(modelId);
  const jsonSchema = supportsJsonSchemaOutput(modelId);
  const entry = {
    capabilities: {
      language: {
        inputs: { image: 'unknown', audio: false },
        objectGeneration: true,
        tools: { usage: true, streaming: true },
        reasoning: { support: 'unknown', preserved },
        sampling: { temperature: true, topP: true, logprobs: false },
        structuredOutput: { jsonSchema },
      },
    },
    providerOptions: {
      language: {
        enableThinking: 'unknown',
        thinkingBudget: 'unknown',
        preserveThinking: preserved,
        parallelToolCalls: true,
      },
    },
  } as const;
  return entry satisfies ModelEntry;
}
export function getAlibabaEmbeddingModelEntry(modelId: string) {
  const known = embeddingModelIds.some(id => id === modelId);
  const entry = {
    capabilities: {
      ...(known
        ? {
            embedding: {
              defaultDimensions: 1024,
              ...alibabaEmbeddingLimits,
              customDimensions: true,
              dimensions:
                modelId === 'text-embedding-v4'
                  ? [64, 128, 256, 512, 768, 1024, 1536, 2048]
                  : [512, 768, 1024],
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
export function getAlibabaVideoModelEntry(modelId: string) {
  const mode = detectMode(modelId),
    protocol = detectProtocol(modelId);
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
        ...documentedVideoDetails[modelId],
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
    video: { mode: 't2v' | 'i2v' | 'r2v'; protocol: AlibabaVideoProtocol };
  }>;
}
export const alibabaModelCatalog = Object.fromEntries([
  ...languageModelIds.map(
    id => [id, getAlibabaLanguageModelEntry(id)] as const,
  ),
  ...embeddingModelIds.map(
    id => [id, getAlibabaEmbeddingModelEntry(id)] as const,
  ),
  ...videoModelIds.map(id => [id, getAlibabaVideoModelEntry(id)] as const),
]);
