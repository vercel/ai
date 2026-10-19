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
  /** Grounding from each automatically continued request, in request order. */
  groundingMetadataPerRequest?: Array<GoogleGenerativeAIGroundingMetadata | null>;
  urlContextMetadata: GoogleGenerativeAIUrlContextMetadata | null;
  safetyRatings: GoogleGenerativeAISafetyRating[] | null;
  serviceTier: string | null;

  /**
   * Opaque token returned when a response stops with `MAX_TOKENS` because it
   * used up its `maxOutputTokens` budget. Pass it back as
   * `providerOptions.google.continuationToken` together with a higher
   * `maxOutputTokens` and the original prompt to resume generation.
   */
  continuationToken?: string | null;

  /**
   * Prompt token count of the first request of a long decode response that
   * was continued automatically (Gemini 4). Usage is summed across requests
   * to match billing, and each continued request re-sends the prompt plus all
   * output so far as input. Use this value instead of the summed input tokens
   * for context window checks and compaction. Only present when the response
   * spanned more than one request.
   */
  initialPromptTokenCount?: number | null;
}
