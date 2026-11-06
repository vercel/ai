import type {
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
import type { AzureImageModelOptions } from './azure-image-model-options';
import type { AzureSpeechModelOptions } from './azure-speech-model-options';
import type { AzureTranscriptionModelOptions } from './azure-transcription-model-options';

/** Azure-specific options; OpenAI-backed operations retain OpenAI's options. */
export const azureProviderOptions = {
  image: {
    api: { description: 'Select the OpenAI or MAI image API.' },
    autoAspectRatio: { description: 'Choose the aspect ratio automatically.' },
    webGrounding: { description: 'Ground image generation in web search.' },
  } satisfies Record<keyof AzureImageModelOptions, ProviderOptionDefinition>,
  speech: {
    api: { description: 'Select the OpenAI or Azure Speech API.' },
    style: { description: 'Speaking style supported by the selected voice.' },
    styleDegree: { description: 'Intensity of the speaking style.' },
  } satisfies Record<keyof AzureSpeechModelOptions, ProviderOptionDefinition>,
  transcription: {
    api: { description: 'Select the OpenAI, Azure Speech, or MAI API.' },
    language: { description: 'Language hint for MAI streaming transcription.' },
    timestamps: { description: 'Word, segment, or no timestamps.' },
    transcribeStyle: { description: 'Verbatim or cleaned transcription.' },
    locales: { description: 'Language to use for transcription.' },
    diarization: { description: 'Enable speaker diarization.' },
    phraseList: { description: 'Phrases to bias transcription toward.' },
  } satisfies Record<
    keyof AzureTranscriptionModelOptions,
    ProviderOptionDefinition
  >,
} as const satisfies ProviderOptionDefinitions;

type AzureRequestConfig = {
  image?: { api: 'mai' };
  speech?: { api: 'speech'; voiceModel: string };
  transcription?:
    | { api: 'speech'; name: string; supportsTimestamps: boolean }
    | { api: 'mai' };
};

type AzureModelEntry = ModelEntry<AzureRequestConfig>;

function imageEntry(webGrounding: boolean): AzureModelEntry {
  return {
    capabilities: {
      image: {
        sizes: {
          description: 'Sides must be multiples of 16 and at least 768 pixels.',
        },
        fileInput: true,
        maskInput: false,
        maxImagesPerCall: 1,
      },
    },
    providerOptions: {
      image: { api: true, autoAspectRatio: webGrounding, webGrounding },
    },
    requestConfig: { image: { api: 'mai' } },
  };
}

function speechEntry(voiceModel: string): AzureModelEntry {
  return {
    capabilities: { speech: { instructions: false } },
    providerOptions: {
      speech: {
        api: true,
        style: {
          condition: 'Supported styles depend on the selected voice and model.',
        },
        styleDegree: { condition: 'Requires a supported speaking style.' },
      },
    },
    requestConfig: { speech: { api: 'speech', voiceModel } },
  };
}

function transcriptionEntry(
  name: string,
  supportsTimestamps: boolean,
): AzureModelEntry {
  return {
    capabilities: {
      transcription: {
        transcription: true,
        streaming: false,
        duration: true,
        segments: supportsTimestamps,
        language: true,
      },
    },
    providerOptions: {
      transcription: {
        api: true,
        language: { condition: 'Requires the MAI streaming API override.' },
        timestamps: supportsTimestamps
          ? true
          : { condition: 'Only none is supported.' },
        transcribeStyle: supportsTimestamps
          ? true
          : { condition: 'Only verbatim is supported.' },
        locales: true,
        diarization: supportsTimestamps,
        phraseList: true,
      },
    },
    requestConfig: {
      transcription: { api: 'speech', name, supportsTimestamps },
    },
  };
}

/**
 * Azure-owned models. OpenAI and DeepSeek deployments use their adapters' model
 * catalogs; arbitrary deployment names do not declare model-family support.
 */
export const azureModelCatalog: Readonly<Record<string, AzureModelEntry>> = {
  'mai-image-2.5': imageEntry(false),
  'mai-image-2.5-flash': imageEntry(false),
  'mai-image-2.5-pro': imageEntry(false),
  'mai-image-2.6': imageEntry(true),
  'mai-image-2.6-flash': imageEntry(true),
  'mai-voice-2.1-flash': speechEntry('MAI-Voice-2.1-Flash'),
  'mai-voice-2.1': speechEntry('MAI-Voice-2.1'),
  'mai-voice-2-flash': speechEntry('MAI-Voice-2-Flash'),
  'mai-voice-2': speechEntry('MAI-Voice-2'),
  'mai-transcribe-2': transcriptionEntry('MAI-Transcribe-2', true),
  'mai-transcribe-1.5': transcriptionEntry('MAI-Transcribe-1.5', false),
  'mai-transcribe-2-streaming': {
    capabilities: {
      transcription: {
        transcription: false,
        streaming: true,
        duration: {
          condition: 'Requires an audio format with a known byte rate.',
        },
        segments: false,
        language: { condition: 'Reports the configured language hint.' },
      },
    },
    providerOptions: {
      transcription: {
        api: true,
        language: true,
        timestamps: false,
        transcribeStyle: false,
        locales: false,
        diarization: false,
        phraseList: false,
      },
    },
    requestConfig: { transcription: { api: 'mai' } },
  },
};

export function getAzureModelEntry(
  modelId: string,
): AzureModelEntry | undefined {
  const id = modelId.toLowerCase();
  return Object.prototype.hasOwnProperty.call(azureModelCatalog, id)
    ? azureModelCatalog[id]
    : undefined;
}
