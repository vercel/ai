/**
 * Audio format configuration shared by provider V4 model specifications.
 */
export type SharedV4AudioFormat = {
  /**
   * Audio format type, e.g. `audio/pcm`, `audio/pcmu`, or `audio/pcma`.
   */
  type: string;

  /**
   * Sample rate in Hz. Only applicable for formats that require a rate.
   */
  rate?: number;
};
