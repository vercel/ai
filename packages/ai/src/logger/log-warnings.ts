import {
  ImageModelV2CallWarning,
  LanguageModelV2CallWarning,
  SpeechModelV2CallWarning,
  TranscriptionModelV2CallWarning,
} from '@ai-sdk/provider';

export type Warning =
  | LanguageModelV2CallWarning
  | ImageModelV2CallWarning
  | SpeechModelV2CallWarning
  | TranscriptionModelV2CallWarning;

export type LogWarningsFunction = (warnings: Warning[]) => void;

export const logWarnings: LogWarningsFunction = warnings => {
  for (const warning of warnings) {
    console.warn(JSON.stringify(warning, null, 2));
  }
};
