import { SpeechModelV3CallOptions } from '../../provider/src/speech-model/v3/speech-model-v3-call-options';
import { TranscriptionModelV3CallOptions } from '../../provider/src/transcription-model/v3/transcription-model-v3-call-options';
import { LanguageModelV3CallOptions } from '../../provider/src/language-model/v3/language-model-v3-call-options';
import { ImageModelV3CallOptions } from '../../provider/src/image-model/v3/image-model-v3-call-options';
import { LanguageModelV3FunctionTool } from '../../provider/src/language-model/v3/language-model-v3-function-tool';
import { LanguageModelV3ProviderDefinedTool } from '../../provider/src/language-model/v3/language-model-v3-provider-defined-tool';

export type SharedV3Warning =
  | {
      type: 'unsupported-setting';
      setting: string;
      details?: string;
    }
  | {
      type: 'compatibility';
      feature: string;
      details?: string;
    }
  | {
      type: 'other';
      message: string;
    };

export type TranscriptionModelV3CallWarning =
  | {
      type: 'unsupported-setting';
      setting: keyof TranscriptionModelV3CallOptions;
      details?: string;
    }
  | {
      type: 'other';
      message: string;
    };

export type ImageModelV3CallWarning =
  | {
      type: 'unsupported-setting';
      setting: keyof ImageModelV3CallOptions;
      details?: string;
    }
  | {
      type: 'other';
      message: string;
    };

export type SpeechModelV3CallWarning =
  | {
      type: 'unsupported-setting';
      setting: keyof SpeechModelV3CallOptions;
      details?: string;
    }
  | {
      type: 'other';
      message: string;
    };

export type LanguageModelV3CallWarning =
  | {
      type: 'unsupported-setting';
      setting: Omit<keyof LanguageModelV3CallOptions, 'prompt'>;
      details?: string;
    }
  | {
      type: 'unsupported-tool';
      tool: LanguageModelV3FunctionTool | LanguageModelV3ProviderDefinedTool;
      details?: string;
    }
  | {
      type: 'other';
      message: string;
    };
