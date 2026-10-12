import type {
  GroundingMetadataSchema,
  UrlContextMetadataSchema,
  SafetyRatingSchema,
} from './google-generative-ai-language-model';

export type GoogleGenerativeAIPrompt = {
  systemInstruction?: GoogleGenerativeAISystemInstruction;
  contents: Array<GoogleGenerativeAIContent>;
};

export type GoogleGenerativeAISystemInstruction = {
  parts: Array<{ text: string }>;
};

export type GoogleGenerativeAIContent = {
  role: 'user' | 'model';
  parts: Array<GoogleGenerativeAIContentPart>;
};

export type GoogleGenerativeAIContentPart =
  | { text: string; thought?: boolean; thoughtSignature?: string }
  | { inlineData: { mimeType: string; data: string } }
  | {
      functionCall: { id?: string; name: string; args: unknown };
      thoughtSignature?: string;
    }
  | {
      functionResponse: {
        id?: string;
        name: string;
        response: unknown;
        parts?: Array<GoogleGenerativeAIFunctionResponsePart>;
      };
    }
  | { fileData: { mimeType: string; fileUri: string } };

export type GoogleGenerativeAIFunctionResponsePart = {
  inlineData: { mimeType: string; data: string };
};

export type GoogleGenerativeAIGroundingMetadata = GroundingMetadataSchema;

export type GoogleGenerativeAIUrlContextMetadata = UrlContextMetadataSchema;

export type GoogleGenerativeAISafetyRating = SafetyRatingSchema;

export interface GoogleGenerativeAIProviderMetadata {
  groundingMetadata: GoogleGenerativeAIGroundingMetadata | null;
  urlContextMetadata: GoogleGenerativeAIUrlContextMetadata | null;
  safetyRatings: GoogleGenerativeAISafetyRating[] | null;
  serviceTier: string | null;

  /**
   * Opaque token returned when a response stops with `MAX_TOKENS` because it
   * used up its `maxOutputTokens` budget (and the latest checkpoint while
   * streaming). Pass it back as `providerOptions.google.continuationToken`
   * together with a higher `maxOutputTokens` and the original prompt to resume
   * generation.
   */
  continuationToken?: string | null;
}
