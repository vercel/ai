import {
  anthropicModelDefinitions,
  embeddingModelDefinitions,
  findRow,
  getGoogleVertexRequestConfig,
  getUnlistedImageModelRow,
  imageModelDefinitions,
  languageModelDefinitions,
  listedLanguageRequestConfig,
  maasModelDefinitions,
  speechModelDefinitions,
  transcriptionModelDefinitions,
  videoModelDefinitions,
  xaiModelDefinitions,
  type GoogleVertexAnthropicModelRow,
  type GoogleVertexEmbeddingModelRow,
  type GoogleVertexImageModelRow,
  type GoogleVertexLanguageModelRow,
  type GoogleVertexMaasModelRow,
  type GoogleVertexSpeechModelRow,
  type GoogleVertexTranscriptionModelRow,
  type GoogleVertexVideoModelRow,
  type GoogleVertexXaiModelRow,
  type VertexRequestConfig,
} from './google-vertex-model-matrix';
import type {
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
import {
  getGoogleLanguageModelEntry,
  googleProviderOptions,
} from '@ai-sdk/google/internal';
import type { GoogleVertexEmbeddingModelOptions } from './google-vertex-embedding-model-options';
import type { GoogleVertexTranscriptionModelOptions } from './google-vertex-transcription-model-options';
import type { GoogleVertexTranscriptionModelGeminiOptions } from './gemini-transcription/google-vertex-gemini-transcription-model-options';
import type { GoogleVertexSpeechModelOptions } from './google-vertex-speech-model-options';

export const googleVertexProviderOptions = {
  language: googleProviderOptions.language,
  image: Object.fromEntries(
    Object.entries(googleProviderOptions.language).filter(
      ([key]) => key !== 'responseModalities',
    ),
  ),
  embedding: {
    outputDimensionality: { description: 'Reduced output dimensions.' },
    taskType: { description: 'Task for which embeddings are optimized.' },
    title: { description: 'Document title; requires RETRIEVAL_DOCUMENT.' },
    autoTruncate: {
      description: 'Truncate inputs exceeding the model context.',
    },
  } satisfies Record<
    keyof GoogleVertexEmbeddingModelOptions,
    ProviderOptionDefinition
  >,
  speech: {
    speechMetadata: { description: 'Directions for Gemini 3.8 speech.' },
    turns: { description: 'Structured transcript for Gemini 3.8 speech.' },
    multiSpeakerVoiceConfig: {
      description: 'Voice configuration for dialogue speakers.',
    },
  } satisfies Record<
    keyof GoogleVertexSpeechModelOptions,
    ProviderOptionDefinition
  >,
  transcription: {
    languageCodes: {
      description: 'Language hints or automatic language detection.',
    },
    enableAutomaticPunctuation: {
      description: 'Include punctuation in Cloud Speech transcripts.',
    },
    enableWordTimeOffsets: {
      description: 'Include Cloud Speech word timestamps.',
    },
    region: { description: 'Cloud Speech region.' },
    customVocabulary: {
      description: 'Vocabulary hints for Gemini transcription.',
    },
    wordTimestamp: { description: 'Include Gemini word timestamps.' },
    diarization: { description: 'Enable Gemini speaker diarization.' },
    mode: { description: 'Verbatim or smart Gemini transcription formatting.' },
    streaming: { description: 'Live Gemini voice activity detection.' },
  } satisfies Record<
    | keyof GoogleVertexTranscriptionModelOptions
    | keyof GoogleVertexTranscriptionModelGeminiOptions,
    ProviderOptionDefinition
  >,
  video: {
    pollIntervalMs: { description: 'Polling interval.' },
    pollTimeoutMs: { description: 'Polling timeout.' },
    personGeneration: { description: 'Policy for generating people.' },
    negativePrompt: { description: 'Content to avoid.' },
    generateAudio: { description: 'Generate synchronized audio.' },
    gcsOutputDirectory: { description: 'Cloud Storage output directory.' },
    referenceImages: { description: 'Reference images for video generation.' },
  },
} as const satisfies ProviderOptionDefinitions;

/*
 * The builders that turn a row of a model matrix into a catalog entry, and
 * the catalogs built from them. The matrices are in
 * `google-vertex-model-matrix.ts`. Nothing here inspects the model ID.
 */

type VertexEntry = ModelEntry<VertexRequestConfig>;

/**
 * Vertex AI restrictions on a Google language model. They hold for every
 * model, so they are applied here instead of being a column.
 */
const vertexLanguageProviderOptionOverrides = { serviceTier: false } as const;

function createLanguageModelEntry(
  row: GoogleVertexLanguageModelRow,
): VertexEntry {
  const google = getGoogleLanguageModelEntry(row.googleModelId);
  return {
    capabilities: { language: google.capabilities.language },
    providerOptions: {
      language: {
        ...google.providerOptions.language,
        ...vertexLanguageProviderOptionOverrides,
      },
    },
    requestConfig: { language: listedLanguageRequestConfig },
  };
}

function createImageModelEntry(row: GoogleVertexImageModelRow): VertexEntry {
  return {
    capabilities: {
      image: {
        sizes: {
          description: 'Use aspectRatio; the size option is unsupported.',
        },
        fileInput: row.documented ? true : 'unknown',
        maskInput: row.documented ? false : 'unknown',
        maxImagesPerCall: 1,
        ...(row.documented
          ? { imageGeneration: true, aspectRatios: row.aspectRatios }
          : {}),
      },
    },
    providerOptions: {
      image: Object.fromEntries(
        Object.keys(googleVertexProviderOptions.image).map(key => [
          key,
          key === 'serviceTier'
            ? false
            : {
                condition:
                  'Support follows the Gemini language model and image configuration.',
              },
        ]),
      ),
    },
    requestConfig: { image: { gemini: row.api === 'gemini' } },
  };
}

function createEmbeddingModelEntry(
  row: GoogleVertexEmbeddingModelRow,
): VertexEntry {
  return {
    capabilities: {
      embedding: {
        defaultDimensions: row.defaultDimensions,
        customDimensions: 'unknown',
        ...{
          maxEmbeddingsPerCall: row.maxEmbeddingsPerCall,
          supportsParallelCalls: true,
          multimodal: row.multimodal,
        },
      },
    },
    providerOptions: {
      embedding: {
        outputDimensionality: 'unknown',
        taskType: 'unknown',
        title: { condition: 'Requires RETRIEVAL_DOCUMENT.' },
        autoTruncate: true,
      },
    },
    requestConfig: {
      embedding: {
        endpoint: row.endpoint,
        maxEmbeddingsPerCall: row.maxEmbeddingsPerCall,
      },
    },
  };
}

function createVideoModelEntry(row: GoogleVertexVideoModelRow): VertexEntry {
  return {
    capabilities: {
      video: {
        inputs: {
          text: true,
          image: true,
          firstFrame: true,
          lastFrame: {
            condition: 'Requires a Veo model supporting frame interpolation.',
          },
          referenceImage: {
            condition: 'Requires a Veo model supporting reference images.',
          },
          referenceVideo: false,
        },
        generateAudio: row.generateAudio,
        aspectRatio: true,
        resolution: true,
        duration: true,
        fps: false,
        seed: true,
        maxVideosPerCall: 4,
      },
    },
    providerOptions: {
      video: {
        pollIntervalMs: true,
        pollTimeoutMs: true,
        personGeneration: true,
        negativePrompt: true,
        generateAudio: row.generateAudio,
        gcsOutputDirectory: true,
        referenceImages: {
          condition: 'Requires a Veo model supporting reference images.',
        },
      },
    },
  };
}

function createSpeechModelEntry(row: GoogleVertexSpeechModelRow): VertexEntry {
  return {
    capabilities: {
      speech: {
        instructions: row.instructions,
        ...{ multiSpeaker: row.multiSpeaker },
      },
    },
    providerOptions: {
      speech: {
        multiSpeakerVoiceConfig: row.multiSpeaker,
        speechMetadata: row.speechMetadata,
        turns: row.turns,
      },
    },
    requestConfig: { speech: { api: row.api } },
  };
}

function createTranscriptionModelEntry(
  row: GoogleVertexTranscriptionModelRow,
): VertexEntry {
  const gemini = row.api === 'gemini';
  return {
    capabilities: {
      transcription: {
        transcription: row.mode === 'batch',
        streaming: row.mode === 'live',
        duration: row.duration,
        segments: row.segments,
        language: true,
        ...(row.wordTimestamps != null
          ? { wordTimestampDescription: row.wordTimestamps }
          : {}),
        ...(row.languageDetection != null
          ? { languageDetectionDescription: row.languageDetection }
          : {}),
      },
    },
    providerOptions: {
      transcription: {
        // Cloud Speech-to-Text options
        languageCodes: true,
        enableAutomaticPunctuation: !gemini,
        enableWordTimeOffsets: !gemini,
        region: !gemini,
        // Gemini options
        customVocabulary: gemini,
        wordTimestamp: gemini,
        diarization: gemini,
        mode: gemini,
      },
    },
    requestConfig: {
      transcription: { api: row.api, live: row.mode === 'live' },
    },
  };
}

// Vertex AI model catalog (Google models)

const entries: [string, VertexEntry][] = [
  ...Object.entries<GoogleVertexLanguageModelRow>(languageModelDefinitions).map(
    ([id, row]): [string, VertexEntry] => [id, createLanguageModelEntry(row)],
  ),
  ...Object.entries<GoogleVertexImageModelRow>(imageModelDefinitions).map(
    ([id, row]): [string, VertexEntry] => [id, createImageModelEntry(row)],
  ),
  ...Object.entries<GoogleVertexEmbeddingModelRow>(
    embeddingModelDefinitions,
  ).map(([id, row]): [string, VertexEntry] => [
    id,
    createEmbeddingModelEntry(row),
  ]),
  ...Object.entries<GoogleVertexVideoModelRow>(videoModelDefinitions).map(
    ([id, row]): [string, VertexEntry] => [id, createVideoModelEntry(row)],
  ),
  ...Object.entries<GoogleVertexSpeechModelRow>(speechModelDefinitions).map(
    ([id, row]): [string, VertexEntry] => [id, createSpeechModelEntry(row)],
  ),
  ...Object.entries<GoogleVertexTranscriptionModelRow>(
    transcriptionModelDefinitions,
  ).map(([id, row]): [string, VertexEntry] => [
    id,
    createTranscriptionModelEntry(row),
  ]),
];

/** A model may expose more than one operation (for example Gemini image models). */
export const googleVertexModelCatalog: Readonly<Record<string, VertexEntry>> =
  entries.reduce<Record<string, VertexEntry>>((catalog, [id, entry]) => {
    const previous = catalog[id];
    catalog[id] = {
      capabilities: { ...previous?.capabilities, ...entry.capabilities },
      providerOptions: {
        ...previous?.providerOptions,
        ...entry.providerOptions,
      },
      requestConfig: { ...previous?.requestConfig, ...entry.requestConfig },
    };
    return catalog;
  }, {});

export const googleVertexAnthropicModelCatalog = Object.fromEntries(
  Object.entries<GoogleVertexAnthropicModelRow>(anthropicModelDefinitions)
    .filter(([, row]) => row.documented)
    .map(([id, row]) => {
      const entry = {
        capabilities: {
          language: {
            inputs: { image: row.image, audio: false },
            objectGeneration: row.objectGeneration,
            tools: {
              usage: row.tools,
              streaming: row.toolStreaming,
              computerUse: row.computerUse,
            },
            reasoning: { support: 'unknown' },
            sampling: {
              temperature: 'unknown',
              topP: 'unknown',
              logprobs: false,
            },
          },
        },
      } as const;
      return [id, entry satisfies ModelEntry];
    }),
);

export const googleVertexXaiModelCatalog = Object.fromEntries(
  Object.entries<GoogleVertexXaiModelRow>(xaiModelDefinitions).map(
    ([id, row]) => {
      const entry = {
        capabilities: {
          language: {
            inputs: { image: 'unknown', audio: 'unknown' },
            objectGeneration: 'unknown',
            tools: { usage: 'unknown', streaming: 'unknown' },
            reasoning: { support: row.reasoning },
            sampling: {
              temperature: 'unknown',
              topP: 'unknown',
              logprobs: 'unknown',
            },
          },
        },
      } as const;
      return [id, entry satisfies ModelEntry];
    },
  ),
);

export const googleVertexMaasModelCatalog = Object.fromEntries(
  Object.entries<GoogleVertexMaasModelRow>(maasModelDefinitions).map(
    ([id, row]) => {
      const entry = {
        capabilities: {
          language: {
            inputs: { image: 'unknown', audio: 'unknown' },
            objectGeneration: 'unknown',
            tools: { usage: 'unknown', streaming: 'unknown' },
            reasoning: { support: 'unknown' },
            sampling: {
              temperature: 'unknown',
              topP: 'unknown',
              logprobs: 'unknown',
            },
            publisher: row.publisher,
          },
        },
        requestConfig: getGoogleVertexRequestConfig(id),
      } as const;
      return [id, entry satisfies ModelEntry<VertexRequestConfig>];
    },
  ),
);

export function getGoogleVertexImageModelEntry(modelId: string): VertexEntry {
  return createImageModelEntry(
    findRow<GoogleVertexImageModelRow>(imageModelDefinitions, modelId) ??
      getUnlistedImageModelRow(modelId),
  );
}

export type { GoogleVertexModelIds } from './google-vertex-model-matrix';
