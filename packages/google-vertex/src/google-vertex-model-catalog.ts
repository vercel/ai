import {
  getGoogleVertexRequestConfig as requestConfig,
  type VertexRequestConfig,
} from './google-vertex-model-catalog-config';
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
const documentedImageDetails: Record<
  string,
  { imageGeneration: boolean; aspectRatios: readonly string[] }
> = {
  'gemini-nano-banana-2.1': {
    imageGeneration: true,
    aspectRatios: [
      '1:1',
      '2:3',
      '3:2',
      '3:4',
      '4:3',
      '4:5',
      '5:4',
      '9:16',
      '16:9',
      '21:9',
      '1:8',
      '8:1',
      '1:4',
      '4:1',
    ],
  },
  'gemini-3.1-flash-image-preview': {
    imageGeneration: true,
    aspectRatios: [
      '1:1',
      '2:3',
      '3:2',
      '3:4',
      '4:3',
      '4:5',
      '5:4',
      '9:16',
      '16:9',
      '21:9',
    ],
  },
  'gemini-3-pro-image-preview': {
    imageGeneration: true,
    aspectRatios: [
      '1:1',
      '2:3',
      '3:2',
      '3:4',
      '4:3',
      '4:5',
      '5:4',
      '9:16',
      '16:9',
      '21:9',
    ],
  },
  'gemini-2.5-flash-image': {
    imageGeneration: true,
    aspectRatios: [
      '1:1',
      '2:3',
      '3:2',
      '3:4',
      '4:3',
      '4:5',
      '5:4',
      '9:16',
      '16:9',
      '21:9',
    ],
  },
};
const documentedTranscriptionDetails: Record<
  string,
  { wordTimestampDescription: string; languageDetectionDescription: string }
> = {
  chirp_2: {
    wordTimestampDescription:
      'Available with a potential quality and speed tradeoff',
    languageDetectionDescription: "Auto detection with `['auto']`",
  },
  chirp_3: {
    wordTimestampDescription:
      'Available with a potential transcription quality tradeoff',
    languageDetectionDescription: "Auto detection with `['auto']`",
  },
  telephony: {
    wordTimestampDescription: 'Available',
    languageDetectionDescription:
      'Explicit supported language codes, with alternative language detection support',
  },
};

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

type VertexEntry = ModelEntry<VertexRequestConfig>;

function languageEntry(modelId: string): VertexEntry {
  const entry = getGoogleLanguageModelEntry(modelId);
  return {
    capabilities: { language: entry.capabilities.language },
    providerOptions: {
      language: { ...entry.providerOptions.language, serviceTier: false },
    },
    requestConfig: { language: requestConfig(modelId).language },
  };
}

const imageModels = [
  'gemini-2.5-flash-image',
  'gemini-3-pro-image-preview',
  'gemini-3.1-flash-image-preview',
  'gemini-nano-banana-2.1',
];

export function getGoogleVertexImageModelEntry(modelId: string): VertexEntry {
  const known = imageModels.includes(modelId);
  return {
    capabilities: {
      image: {
        sizes: {
          description: 'Use aspectRatio; the size option is unsupported.',
        },
        fileInput: known ? true : 'unknown',
        maskInput: known ? false : 'unknown',
        maxImagesPerCall: 1,
        ...documentedImageDetails[modelId],
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
    requestConfig: { image: requestConfig(modelId).image },
  };
}

function embeddingEntry(modelId: string): VertexEntry {
  const gemini = modelId.startsWith('gemini-embedding-');
  return {
    capabilities: {
      embedding: {
        defaultDimensions: gemini ? 3072 : 768,
        customDimensions: 'unknown',
        ...{
          maxEmbeddingsPerCall:
            requestConfig(modelId).embedding!.maxEmbeddingsPerCall,
          supportsParallelCalls: true,
          multimodal:
            requestConfig(modelId).embedding!.endpoint === 'embedContent',
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
    requestConfig: { embedding: requestConfig(modelId).embedding },
  };
}

function speechEntry(modelId: string): VertexEntry {
  const chirp = requestConfig(modelId).speech?.api === 'cloud-tts';
  return {
    capabilities: {
      speech: { instructions: !chirp, ...{ multiSpeaker: !chirp } },
    },
    providerOptions: {
      speech: {
        multiSpeakerVoiceConfig: chirp ? false : true,
        speechMetadata: chirp
          ? false
          : { condition: 'Requires Gemini 3.8 TTS.' },
        turns: chirp ? false : { condition: 'Requires Gemini 3.8 TTS.' },
      },
    },
    requestConfig: { speech: requestConfig(modelId).speech },
  };
}

function transcriptionEntry(modelId: string): VertexEntry {
  const config = requestConfig(modelId).transcription!;
  const gemini = config.api === 'gemini';
  return {
    capabilities: {
      transcription: {
        transcription: !config.live,
        streaming: config.live,
        duration: gemini ? false : true,
        segments: config.live
          ? false
          : { condition: 'Requires word timestamps.' },
        language: true,
        ...documentedTranscriptionDetails[modelId],
      },
    },
    providerOptions: {
      transcription: {
        languageCodes: true,
        enableAutomaticPunctuation: !gemini,
        enableWordTimeOffsets: !gemini,
        region: !gemini,
        customVocabulary: gemini,
        wordTimestamp: gemini,
        diarization: gemini,
        mode: gemini,
      },
    },
    requestConfig: { transcription: config },
  };
}

function videoEntry(modelId: string): VertexEntry {
  const veo3 = modelId.startsWith('veo-3');
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
        generateAudio: veo3,
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
        generateAudio: veo3,
        gcsOutputDirectory: true,
        referenceImages: {
          condition: 'Requires a Veo model supporting reference images.',
        },
      },
    },
  };
}

const entries: [string, VertexEntry][] = [
  ...[
    'gemini-nano-banana-2.1',
    'gemini-4-argon',
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash-lite',
    'gemini-2.0-flash',
    'gemini-2.0-flash-001',
    'gemini-1.5-flash',
    'gemini-1.5-flash-001',
    'gemini-1.5-flash-002',
    'gemini-1.5-pro',
    'gemini-1.5-pro-001',
    'gemini-1.5-pro-002',
    'gemini-1.0-pro-001',
    'gemini-1.0-pro-vision-001',
    'gemini-1.0-pro',
    'gemini-1.0-pro-002',
    'gemini-2.0-flash-lite-preview-02-05',
    'gemini-2.5-flash-preview-09-2025',
    'gemini-3-pro-preview',
    'gemini-3-pro-image-preview',
    'gemini-3-flash-preview',
    'gemini-3.1-pro-preview',
    'gemini-3.1-flash-image-preview',
    'gemini-3.1-flash-lite-preview',
    'gemini-2.0-pro-exp-02-05',
    'gemini-2.0-flash-exp',
  ].map((id): [string, VertexEntry] => [id, languageEntry(id)]),
  ...[
    'gemini-2.5-flash-image',
    'gemini-3-pro-image-preview',
    'gemini-3.1-flash-image-preview',
    'gemini-nano-banana-2.1',
  ].map((id): [string, VertexEntry] => [
    id,
    getGoogleVertexImageModelEntry(id),
  ]),
  ...[
    'textembedding-gecko',
    'textembedding-gecko@001',
    'textembedding-gecko@003',
    'textembedding-gecko-multilingual',
    'textembedding-gecko-multilingual@001',
    'text-multilingual-embedding-002',
    'text-embedding-004',
    'text-embedding-005',
    'gemini-embedding-001',
    'gemini-embedding-2',
    'gemini-embedding-2-preview',
  ].map((id): [string, VertexEntry] => [id, embeddingEntry(id)]),
  ...[
    'veo-2.0-generate-preview',
    'veo-2.0-generate-exp',
    'veo-2.0-generate-001',
    'veo-3.0-generate-001',
    'veo-3.0-fast-generate-001',
    'veo-3.0-generate-preview',
    'veo-3.0-fast-generate-preview',
    'veo-3.1-generate-001',
    'veo-3.1-fast-generate-001',
    'veo-3.1-generate-preview',
    'veo-3.1-fast-generate-preview',
  ].map((id): [string, VertexEntry] => [id, videoEntry(id)]),
  ...[
    'gemini-2.5-flash-tts',
    'gemini-2.5-pro-tts',
    'gemini-2.5-flash-lite-preview-tts',
    'gemini-3.1-flash-tts-preview',
    'chirp-3-hd',
  ].map((id): [string, VertexEntry] => [id, speechEntry(id)]),
  ...['chirp_2', 'chirp_3', 'telephony'].map((id): [string, VertexEntry] => [
    id,
    transcriptionEntry(id),
  ]),
  ...['gemini-3.5-transcribe', 'gemini-3.5-transcribe-live'].map(
    (id): [string, VertexEntry] => [id, transcriptionEntry(id)],
  ),
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

const vertexAnthropicModels = {
  'claude-fable-5-1': {
    image: true,
    objectGeneration: true,
    tools: true,
    streaming: true,
    computerUse: true,
  },
  'claude-3-7-sonnet@20250219': {
    image: true,
    objectGeneration: true,
    tools: true,
    streaming: true,
    computerUse: true,
  },
  'claude-3-5-sonnet-v2@20241022': {
    image: true,
    objectGeneration: true,
    tools: true,
    streaming: true,
    computerUse: true,
  },
  'claude-3-5-sonnet@20240620': {
    image: true,
    objectGeneration: true,
    tools: true,
    streaming: true,
    computerUse: false,
  },
  'claude-3-5-haiku@20241022': {
    image: false,
    objectGeneration: true,
    tools: true,
    streaming: true,
    computerUse: false,
  },
  'claude-3-sonnet@20240229': {
    image: true,
    objectGeneration: true,
    tools: true,
    streaming: true,
    computerUse: false,
  },
  'claude-3-haiku@20240307': {
    image: true,
    objectGeneration: true,
    tools: true,
    streaming: true,
    computerUse: false,
  },
  'claude-3-opus@20240229': {
    image: true,
    objectGeneration: true,
    tools: true,
    streaming: true,
    computerUse: false,
  },
};
export const googleVertexAnthropicModelCatalog = Object.fromEntries(
  Object.entries(vertexAnthropicModels).map(([id, support]) => {
    const entry = {
      capabilities: {
        language: {
          inputs: { image: support.image, audio: false },
          objectGeneration: support.objectGeneration,
          tools: {
            usage: support.tools,
            streaming: support.streaming,
            computerUse: support.computerUse,
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
const vertexXaiModels = {
  'xai/grok-4.20-reasoning': { reasoning: true },
  'xai/grok-4.20-non-reasoning': { reasoning: false },
  'xai/grok-4.1-fast-reasoning': { reasoning: true },
  'xai/grok-4.1-fast-non-reasoning': { reasoning: false },
};
export const googleVertexXaiModelCatalog = Object.fromEntries(
  Object.entries(vertexXaiModels).map(([id, support]) => {
    const entry = {
      capabilities: {
        language: {
          inputs: { image: 'unknown', audio: 'unknown' },
          objectGeneration: 'unknown',
          tools: { usage: 'unknown', streaming: 'unknown' },
          reasoning: { support: support.reasoning },
          sampling: {
            temperature: 'unknown',
            topP: 'unknown',
            logprobs: 'unknown',
          },
        },
      },
    } as const;
    return [id, entry satisfies ModelEntry];
  }),
);
const vertexMaasModels = {
  'deepseek-ai/deepseek-r1-0528-maas': { publisher: 'DeepSeek' },
  'deepseek-ai/deepseek-v3.1-maas': { publisher: 'DeepSeek' },
  'deepseek-ai/deepseek-v3.2-maas': { publisher: 'DeepSeek' },
  'openai/gpt-oss-120b-maas': { publisher: 'OpenAI' },
  'openai/gpt-oss-20b-maas': { publisher: 'OpenAI' },
  'meta/llama-4-maverick-17b-128e-instruct-maas': { publisher: 'Meta' },
  'meta/llama-4-scout-17b-16e-instruct-maas': { publisher: 'Meta' },
  'minimax/minimax-m2-maas': { publisher: 'MiniMax' },
  'qwen/qwen3-coder-480b-a35b-instruct-maas': { publisher: 'Qwen' },
  'qwen/qwen3-next-80b-a3b-instruct-maas': { publisher: 'Qwen' },
  'qwen/qwen3-next-80b-a3b-thinking-maas': { publisher: 'Qwen' },
  'moonshotai/kimi-k2-thinking-maas': { publisher: 'Moonshot' },
};
export const googleVertexMaasModelCatalog = Object.fromEntries(
  Object.entries(vertexMaasModels).map(([id, support]) => {
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
          publisher: support.publisher,
        },
      },
      requestConfig: requestConfig(id),
    } as const;
    return [id, entry satisfies ModelEntry<VertexRequestConfig>];
  }),
);
