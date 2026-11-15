// @ts-nocheck
import { createGoogleGenerativeAI as createGoogleGenerativeAIOriginal } from '@ai-sdk/google';

export function createGoogleGenerativeAI() {
  return createGoogleGenerativeAIOriginal();
}

export const provider = createGoogleGenerativeAI();
