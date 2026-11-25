// @ts-nocheck
import { createGoogle as createGoogleGenerativeAIOriginal } from '@ai-sdk/google';

export function createGoogleGenerativeAI() {
  return createGoogleGenerativeAIOriginal();
}

export const provider = createGoogleGenerativeAI();
