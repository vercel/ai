import { ImageModelV3CallOptions } from './image-model-v3-call-options';

/**
Warning from the model provider for this call. The call will proceed, but e.g.
some settings might not be supported, which can lead to suboptimal results.
 */
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
