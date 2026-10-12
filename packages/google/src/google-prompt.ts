import type {
  GroundingMetadataSchema,
  PromptFeedbackSchema,
  SafetyRatingSchema,
  UrlContextMetadataSchema,
  UsageMetadataSchema,
} from './google-language-model';

export type GooglePrompt = {
  systemInstruction?: GoogleSystemInstruction;
  contents: Array<GoogleContent>;
};

export type GoogleSystemInstruction = {
  parts: Array<{ text: string }>;
};

export type GoogleContent = {
  role: 'user' | 'model';
  parts: Array<GoogleContentPart>;
};

export type GoogleContentPart =
  | { text: string; thought?: boolean; thoughtSignature?: string }
  | {
      inlineData: { mimeType: string; data: string };
      thought?: boolean;
      thoughtSignature?: string;
    }
  | {
      functionCall: { id?: string; name: string; args: unknown };
      thoughtSignature?: string;
    }
  | {
      functionResponse: {
        id?: string;
        name: string;
        response: unknown;
        parts?: Array<GoogleFunctionResponsePart>;
      };
    }
  | {
      fileData: { mimeType: string; fileUri: string };
      thought?: boolean;
      thoughtSignature?: string;
    }
  | {
      toolCall: {
        toolType: string;
        args?: unknown;
        id: string;
      };
      thoughtSignature?: string;
    }
  | {
      toolResponse: {
        toolType: string;
        response?: unknown;
        id: string;
      };
      thoughtSignature?: string;
    }
  | {
      executableCode: {
        language: string;
        code: string;
      };
    }
  | {
      codeExecutionResult: {
        outcome: string;
        output: string;
      };
    };

export type GoogleFunctionResponsePart =
  | {
      inlineData: { mimeType: string; data: string };
    }
  | {
      fileData: { mimeType: string; fileUri: string };
    };

export type GoogleGroundingMetadata = GroundingMetadataSchema;

export type GoogleUrlContextMetadata = UrlContextMetadataSchema;

export type GoogleSafetyRating = SafetyRatingSchema;

export type GooglePromptFeedback = PromptFeedbackSchema;

export type GoogleUsageMetadata = UsageMetadataSchema;

export interface GoogleProviderMetadata {
  promptFeedback: GooglePromptFeedback | null;
  groundingMetadata: GoogleGroundingMetadata | null;
  urlContextMetadata: GoogleUrlContextMetadata | null;
  safetyRatings: GoogleSafetyRating[] | null;
  usageMetadata: GoogleUsageMetadata | null;
  finishReason?: string | null;
  finishMessage: string | null;
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
