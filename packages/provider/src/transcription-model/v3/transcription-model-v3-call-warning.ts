import { TranscriptionModelV3CallOptions } from './transcription-model-v3-call-options';

/**
Warning from the model provider for this call. The call will proceed, but e.g.
some settings might not be supported, which can lead to suboptimal results.
 */
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
