// https://luma.ai/models?type=image
export type LumaImageModelId = 'photon-1' | 'photon-flash-1' | (string & {});

/**
Configuration settings for Luma image generation.

Since the Luma API processes images through an asynchronous queue system, these
settings allow you to tune the polling behavior when waiting for image
generation to complete.
 */
export interface LumaImageSettings {
  /**
Override the polling interval in milliseconds (default 500). This controls how
frequently the API is checked for completed images while they are being
processed in Luma's queue.
   */
  pollIntervalMillis?: number;

  /**
Override the maximum number of polling attempts (default 120). Since image
generation is queued and processed asynchronously, this limits how long to wait
for results before timing out.
   */
  maxPollAttempts?: number;
}
