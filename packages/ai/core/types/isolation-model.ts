import {
  IsolationModelV1,
  IsolationModelV1CallWarning,
} from '@ai-sdk/provider';

/**
Isolation model that is used by the AI SDK Core functions.
  */
export type IsolationModel = IsolationModelV1;

/**
Warning from the model provider for this call. The call will proceed, but e.g.
some settings might not be supported, which can lead to suboptimal results.
  */
export type IsolationWarning = IsolationModelV1CallWarning;
