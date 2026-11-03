// @ts-nocheck
import {
  createGoogle as createGoogleGenerativeAI,
  createGoogle,
  type GoogleLanguageModelOptions as GoogleGenerativeAIProviderOptions,
  type GoogleImageModelOptions as GoogleGenerativeAIImageProviderOptions,
  type GoogleEmbeddingModelOptions as GoogleGenerativeAIEmbeddingProviderOptions,
  type GoogleVideoModelOptions as GoogleGenerativeAIVideoProviderOptions,
  type GoogleVideoModelId as GoogleGenerativeAIVideoModelId,
  type GoogleProviderMetadata as GoogleGenerativeAIProviderMetadata,
  type GoogleProviderSettings as GoogleGenerativeAIProviderSettings,
} from '@ai-sdk/google';
export { createGoogleGenerativeAI };
export { createGoogleGenerativeAI as customGoogle };
export { createGoogle as createGoogleGenerativeAI } from '@ai-sdk/google';
export { createGoogleGenerativeAI as otherGoogle } from 'other-provider';
export type { GoogleLanguageModelOptions as GoogleGenerativeAIProviderOptions } from '@ai-sdk/google';
const object = { createGoogleGenerativeAI, createGoogleGenerativeAIKey: true };
const properties = { createGoogleGenerativeAI: 'application key' };
console.log(object.createGoogleGenerativeAI, object['createGoogleGenerativeAI']);
export function createWithBlockBinding(flag: boolean) {
  if (flag) {
    const createGoogleGenerativeAI = () => null;
    console.log(createGoogleGenerativeAI());
  }
  return createGoogleGenerativeAI();
}
export function createWithNewNameParameter(createGoogle: () => unknown) {
  return createGoogleGenerativeAI();
}
