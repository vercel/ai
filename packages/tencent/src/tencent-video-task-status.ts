import type {
  Experimental_VideoModelV3VideoData as VideoModelV3VideoData,
  SharedV3ProviderMetadata,
  SharedV3Warning,
} from '@ai-sdk/provider';

type TencentVideoTaskResponse = {
  timestamp: Date;
  modelId: string;
  headers: Record<string, string> | undefined;
};

/**
 * The state of a submitted TokenHub or VOD video task, read from one status
 * request. `doGenerate` polls until it is no longer `pending`.
 */
export type TencentVideoTaskStatus =
  | { status: 'pending'; response: TencentVideoTaskResponse }
  | { status: 'error'; error: string; response: TencentVideoTaskResponse }
  | {
      status: 'completed';
      videos: Array<VideoModelV3VideoData>;
      warnings: Array<SharedV3Warning>;
      providerMetadata?: SharedV3ProviderMetadata;
      response: TencentVideoTaskResponse;
    };
