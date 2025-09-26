import { VideoModelV2CallOptions } from './video-model-v2-call-options';

/**
Warning from the model provider for this call. The call will proceed, but e.g.
some settings might not be supported, which can lead to suboptimal results.
 */
export type VideoModelV2CallWarning =
  | {
      type: 'unsupported-setting';
      setting: keyof VideoModelV2CallOptions;
      details?: string;
    }
  | {
      type: 'other';
      message: string;
    };


