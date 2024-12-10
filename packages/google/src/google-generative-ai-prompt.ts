import { z } from 'zod';
import { safetyRatingSchema } from './google-generative-ai-language-model';

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
  | { text: string }
  | {
      inlineData: {
        mimeType: string;
        data: string;
      };
    }
  | {
      functionCall: {
        name: string;
        args: unknown;
      };
    }
  | {
      functionResponse: {
        name: string;
        response: unknown;
      };
    }
  | {
      fileData: {
        mimeType: string;
        fileUri: string;
      };
    };

export interface GoogleGenerativeAIGroundingMetadata {
  webSearchQueries?: string[] | null;
  searchEntryPoint?: { renderedContent: string } | null;
  groundingSupports?: Array<{
    segment: {
      text?: string | null;
      startIndex?: number | null;
      endIndex?: number | null;
    };
    groundingChunkIndices: number[];
    confidenceScores: number[];
  }> | null;
}

export type GoogleGenerativeAISafetyRating = z.infer<typeof safetyRatingSchema>;

export interface GoogleGenerativeAIProviderMetadata {
  groundingMetadata: GoogleGenerativeAIGroundingMetadata | null;
  safetyRatings: GoogleGenerativeAISafetyRating[] | null;
}
