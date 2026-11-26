import type {
  ModelCapability,
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
import type {
  MiniMaxLanguageModelChatOptions,
  MiniMaxLanguageModelOptions,
} from './minimax-chat-language-model-options';
import type { MiniMaxImageModelOptions } from './minimax-image-model-options';
import type { MiniMaxVideoModelOptions } from './minimax-video-model-options';
import { minimaxVideoResolutions } from './minimax-model-catalog-config';
/** Known options accepted under providerOptions; open-ended extension keys remain undeclared. */
export const miniMaxProviderOptions = {
  image: {
    area: {
      description: 'Output area: 1K, 2K, or 4K. Use without a pixel size.',
    },
    disablePromptEnhanced: {
      description: 'Disable prompt enhancement for text-to-image requests.',
    },
    outputCompression: {
      description: 'JPEG or WebP compression quality, from 0 to 100.',
    },
    outputFormat: { description: 'Output format: JPEG, PNG, or WebP.' },
  } satisfies Record<keyof MiniMaxImageModelOptions, ProviderOptionDefinition>,
  language: {
    effort: {
      description:
        "Reasoning effort for MiniMax M3.1 and later models. Higher levels can use more reasoning tokens and increase latency. Defaults to the server's setting.",
    },
    serviceTier: {
      description:
        "Request admission tier (`standard` or `priority`), sent as `service_tier`. Priority admission is billed at 1.5x the standard price. Omit to use the API's default tier.",
    },
    thinking: { description: 'thinking' },
  } satisfies Record<
    keyof MiniMaxLanguageModelChatOptions | keyof MiniMaxLanguageModelOptions,
    ProviderOptionDefinition
  >,
  video: {
    resolution: { description: 'Output resolution.' },
    ratio: {
      description:
        'Aspect ratio of the generated video. Overrides the top-level `aspectRatio`.',
    },
    referenceAudioUrls: {
      description: 'Reference audio URLs for reference-to-video generation.',
    },
    aigcWatermark: {
      description:
        'Whether to embed an AIGC watermark in the output. Defaults to `false`.',
    },
    pollIntervalMs: {
      description:
        'Interval in milliseconds between task status polls. Default: 10000.',
    },
    pollTimeoutMs: {
      description:
        'Maximum time in milliseconds to poll before timing out. Default: 600000.',
    },
  } satisfies Record<keyof MiniMaxVideoModelOptions, ProviderOptionDefinition>,
} as const satisfies ProviderOptionDefinitions;

/*
 * Every model type below has the same layout: the row type, the matrix (model
 * IDs by capability), the builder that turns a row into a catalog entry, and
 * the row for model IDs that are not listed.
 *
 * A row is flat and every listed model fills in every cell. Nothing in a row
 * is derived from the model ID. The fallback for unlisted language model IDs
 * is the only place that looks at the model ID.
 */

// Language models

/** One row of the language model matrix. */
export type MiniMaxLanguageModelRow = {
  /**
   * `false`: nothing is documented for the model ID. Object generation and
   * tool support are then reported as `'unknown'`.
   */
  documented: boolean;
  image: boolean;
  /** Accepts image and video inputs as HTTP(S) URLs. */
  mediaUrls: boolean;
  /**
   * Highest temperature the model accepts. `undefined`: the limit of the
   * Anthropic-compatible API applies.
   */
  maxTemperature: number | undefined;
  /** Accepts temperature and topP while thinking. */
  samplingWithThinking: boolean;
  /** Provider options that cache control is read from. */
  cacheControl: 'anthropic' | 'minimax';
  /**
   * How the portable reasoning setting is sent: as a MiniMax `effort`, or as
   * an Anthropic thinking `budget`.
   */
  reasoning: 'effort' | 'budget';
};

/**
 * Language model matrix: model IDs by capability. To add a model, add a row
 * and fill in every column.
 */
const languageModelDefinitions = {
  'minimax-m3.1-flash': {
    documented: true,
    image: true,
    mediaUrls: true,
    maxTemperature: 2,
    samplingWithThinking: true,
    cacheControl: 'minimax',
    reasoning: 'effort',
  },
  'minimax-m3': {
    documented: true,
    image: false,
    mediaUrls: false,
    maxTemperature: undefined,
    samplingWithThinking: false,
    cacheControl: 'anthropic',
    reasoning: 'budget',
  },
  'minimax-m2.7': {
    documented: true,
    image: false,
    mediaUrls: false,
    maxTemperature: undefined,
    samplingWithThinking: false,
    cacheControl: 'anthropic',
    reasoning: 'budget',
  },
  'minimax-m2.7-highspeed': {
    documented: true,
    image: false,
    mediaUrls: false,
    maxTemperature: undefined,
    samplingWithThinking: false,
    cacheControl: 'anthropic',
    reasoning: 'budget',
  },
  'minimax-m2.5': {
    documented: true,
    image: false,
    mediaUrls: false,
    maxTemperature: undefined,
    samplingWithThinking: false,
    cacheControl: 'anthropic',
    reasoning: 'budget',
  },
  'minimax-m2.5-highspeed': {
    documented: true,
    image: false,
    mediaUrls: false,
    maxTemperature: undefined,
    samplingWithThinking: false,
    cacheControl: 'anthropic',
    reasoning: 'budget',
  },
  'minimax-m2.1': {
    documented: true,
    image: false,
    mediaUrls: false,
    maxTemperature: undefined,
    samplingWithThinking: false,
    cacheControl: 'anthropic',
    reasoning: 'budget',
  },
  'minimax-m2.1-highspeed': {
    documented: true,
    image: false,
    mediaUrls: false,
    maxTemperature: undefined,
    samplingWithThinking: false,
    cacheControl: 'anthropic',
    reasoning: 'budget',
  },
  'minimax-m2': {
    documented: true,
    image: false,
    mediaUrls: false,
    maxTemperature: undefined,
    samplingWithThinking: false,
    cacheControl: 'anthropic',
    reasoning: 'budget',
  },
} satisfies Record<string, MiniMaxLanguageModelRow>;

/** Maps a matrix row to its entry. Nothing here inspects the model ID. */
function createLanguageModelEntry(row: MiniMaxLanguageModelRow) {
  const documentedSupport: ModelCapability = row.documented ? true : 'unknown';
  const entry = {
    capabilities: {
      language: {
        inputs: { image: row.image, audio: false },
        objectGeneration: documentedSupport,
        tools: { usage: documentedSupport, streaming: documentedSupport },
        reasoning: { support: true },
        sampling: { temperature: true, topP: true, logprobs: false },
      },
    },
    providerOptions: {
      language: Object.fromEntries(
        Object.keys(miniMaxProviderOptions.language).map(key => [key, true]),
      ),
    },
    requestConfig: {
      language: {
        mediaUrls: row.mediaUrls,
        maxTemperature: row.maxTemperature,
        samplingWithThinking: row.samplingWithThinking,
        cacheControl: row.cacheControl,
        reasoning: row.reasoning,
      },
    },
  } as const;
  return entry satisfies ModelEntry<{
    language: Omit<MiniMaxLanguageModelRow, 'documented' | 'image'>;
  }>;
}

const listedLanguageModelEntries = Object.fromEntries(
  Object.entries<MiniMaxLanguageModelRow>(languageModelDefinitions).map(
    ([modelId, row]) => [modelId, createLanguageModelEntry(row)],
  ),
);

/**
 * Returns the entry of a listed language model ID from its row. Every other
 * model ID uses the fallback for unlisted IDs.
 */
export function getMiniMaxLanguageModelEntry(modelId: string) {
  return Object.prototype.hasOwnProperty.call(
    listedLanguageModelEntries,
    modelId,
  )
    ? listedLanguageModelEntries[modelId]
    : createLanguageModelEntry(getUnlistedLanguageModelRow(modelId));
}

/**
 * Resolves a language model ID that is not listed in the matrix to a row.
 * This is the only place that derives capabilities from the model ID: an
 * unlisted M-series model from M3.1 on is assumed to behave like M3.1, so
 * that new models keep working before they are listed.
 */
function getUnlistedLanguageModelRow(modelId: string): MiniMaxLanguageModelRow {
  // Compare version components as integers: M3.123 is newer than M3.1.
  const version = /^minimax-m(\d+)(?:\.(\d+))?(?:\.\d+)*(?:-|$)/i.exec(modelId);
  const m31OrLater =
    version != null &&
    (Number(version[1]) > 3 ||
      (Number(version[1]) === 3 && Number(version[2] ?? 0) >= 1));

  return m31OrLater
    ? {
        documented: false,
        image: true,
        mediaUrls: true,
        maxTemperature: 2,
        samplingWithThinking: true,
        cacheControl: 'minimax',
        reasoning: 'effort',
      }
    : {
        documented: false,
        image: false,
        mediaUrls: false,
        maxTemperature: undefined,
        samplingWithThinking: false,
        cacheControl: 'anthropic',
        reasoning: 'budget',
      };
}

// Video models

type MiniMaxVideoResolution = (typeof minimaxVideoResolutions)[number];

/** One row of the video model matrix. */
export type MiniMaxVideoModelRow = {
  resolutions: readonly MiniMaxVideoResolution[];
  defaultResolution: MiniMaxVideoResolution;
  minDurationSeconds: number;
  /** Reference-to-video: reference images, videos, and audio. */
  references: boolean;
};

const videoModelDefinitions = {
  'MiniMax-H3': {
    resolutions: ['768P', '2K'],
    defaultResolution: '2K',
    minDurationSeconds: 4,
    references: true,
  },
  'MiniMax-H3-Max': {
    resolutions: ['480P', '768P'],
    defaultResolution: '768P',
    minDurationSeconds: 5,
    references: false,
  },
} satisfies Record<string, MiniMaxVideoModelRow>;

/** Row for video model IDs that are not listed in the matrix. */
const unlistedVideoModel: MiniMaxVideoModelRow = {
  resolutions: minimaxVideoResolutions,
  defaultResolution: '2K',
  minDurationSeconds: 5,
  references: true,
};

function createVideoModelEntry(row: MiniMaxVideoModelRow) {
  const entry = {
    capabilities: {
      video: {
        inputs: {
          text: true,
          image: true,
          firstFrame: true,
          lastFrame: { condition: 'A first frame is also supplied.' },
          referenceImage: row.references,
          referenceVideo: row.references,
        },
        generateAudio: false,
        aspectRatio: { condition: 'No frame images are supplied.' },
        resolution: true,
        duration: true,
        fps: false,
        seed: false,
        maxVideosPerCall: 1,
      },
    },
    providerOptions: {
      video: {
        ...Object.fromEntries(
          Object.keys(miniMaxProviderOptions.video).map(key => [key, true]),
        ),
        referenceAudioUrls: row.references,
      },
    },
    requestConfig: {
      video: {
        supportedResolutions: row.resolutions,
        defaultResolution: row.defaultResolution,
        minDurationSeconds: row.minDurationSeconds,
      },
    },
  } as const;
  return entry satisfies ModelEntry<{
    video: {
      supportedResolutions: readonly string[];
      defaultResolution: string;
      minDurationSeconds: number;
    };
  }>;
}

export function getMiniMaxVideoModelEntry(modelId: string) {
  return createVideoModelEntry(
    Object.prototype.hasOwnProperty.call(videoModelDefinitions, modelId)
      ? videoModelDefinitions[modelId as keyof typeof videoModelDefinitions]
      : unlistedVideoModel,
  );
}

// Image models. No capability differs between them, so there is no matrix.

const imageModelIds = [
  'MiniMax-H3-Image',
  'MiniMax-H3-Image-Highspeed',
] as const;

export function getMiniMaxImageModelEntry() {
  return {
    capabilities: {
      image: {
        fileInput: true,
        maskInput: false,
        sizes: {
          description:
            '655,360 to 20,000,000 pixels, with aspect ratio from 1:3 to 3:1.',
        },
        maxImagesPerCall: 10,
      },
    },
    providerOptions: {
      image: {
        area: true,
        disablePromptEnhanced: { condition: 'Text-to-image requests only.' },
        outputCompression: { condition: 'JPEG or WebP output only.' },
        outputFormat: true,
      },
    },
  } as const satisfies ModelEntry;
}

export const minimaxModelCatalog = Object.fromEntries([
  ...imageModelIds.map(id => [id, getMiniMaxImageModelEntry()] as const),
  ...Object.keys(languageModelDefinitions).map(
    id => [id, getMiniMaxLanguageModelEntry(id)] as const,
  ),
  ...Object.keys(videoModelDefinitions).map(
    id => [id, getMiniMaxVideoModelEntry(id)] as const,
  ),
]);

/** Known model IDs, derived from the matrices used to build the catalog. */
export type MiniMaxModelIds = {
  image: (typeof imageModelIds)[number];
  language: keyof typeof languageModelDefinitions;
  video: keyof typeof videoModelDefinitions;
};
