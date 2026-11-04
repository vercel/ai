export type AzureTranscriptionProviderMetadata = {
  azure: {
    phrases: Array<{
      text: string;
      offsetMilliseconds?: number | null;
      durationMilliseconds?: number | null;
      locale?: string | null;
      speaker?: number | null;
      confidence?: number | null;
      words?: Array<{
        text: string;
        offsetMilliseconds?: number | null;
        durationMilliseconds?: number | null;
      }> | null;
    }>;
  };
};
