import { z } from 'zod/v4';
import { groundingMetadataSchema } from './tool/google-search';
import { urlContextMetadataSchema } from './tool/url-context';
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
  | { inlineData: { mimeType: string; data: string } }
  | { functionCall: { name: string; args: unknown } }
  | { functionResponse: { name: string; response: unknown } }
  | { fileData: { mimeType: string; fileUri: string } };

export type GoogleGenerativeAIGroundingMetadata = z.infer<
  typeof groundingMetadataSchema
>;

export type GoogleGenerativeAIUrlContextMetadata = z.infer<
  typeof urlContextMetadataSchema
>;

export type GoogleGenerativeAISafetyRating = z.infer<typeof safetyRatingSchema>;

export interface GoogleGenerativeAIProviderMetadata {
  groundingMetadata: GoogleGenerativeAIGroundingMetadata | null;
  urlContextMetadata: GoogleGenerativeAIUrlContextMetadata | null;
  safetyRatings: GoogleGenerativeAISafetyRating[] | null;
}
