import {
  GroundingMetadataSchema,
  UrlContextMetadataSchema,
} from './google-generative-ai-language-model';
import { type SafetyRatingSchema } from './google-generative-ai-language-model';

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
  | { functionCall: { name: string; args: unknown }; thoughtSignature?: string }
  | { functionResponse: { name: string; response: unknown } }
  | { fileData: { mimeType: string; fileUri: string } };

export type GoogleGenerativeAIGroundingMetadata = GroundingMetadataSchema;

export type GoogleGenerativeAIUrlContextMetadata = UrlContextMetadataSchema;

export type GoogleGenerativeAISafetyRating = SafetyRatingSchema;

export interface GoogleGenerativeAIProviderMetadata {
  groundingMetadata: GoogleGenerativeAIGroundingMetadata | null;
  urlContextMetadata: GoogleGenerativeAIUrlContextMetadata | null;
  safetyRatings: GoogleGenerativeAISafetyRating[] | null;
}
