import { IsolationModelV1CallOptions } from './isolation-model-v1-call-options';

/**
 * Warning from the model provider for this call. The call will proceed, but e.g.
 * some settings might not be supported, which can lead to suboptimal results.
 */
export type IsolationModelV1CallWarning =
  | {
      type: 'unsupported-setting';
      setting: keyof IsolationModelV1CallOptions;
      details?: string;
    }
  | {
      type: 'other';
      message: string;
    };
