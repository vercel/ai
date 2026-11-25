// @ts-nocheck
import {
  createGoogleGenerativeAI,
  createGoogle,
  type GoogleGenerativeAIProviderOptions,
  type GoogleGenerativeAIImageProviderOptions,
  type GoogleGenerativeAIEmbeddingProviderOptions,
  type GoogleGenerativeAIVideoProviderOptions,
  type GoogleGenerativeAIVideoModelId,
  type GoogleGenerativeAIProviderMetadata,
  type GoogleGenerativeAIProviderSettings,
} from '@ai-sdk/google';
export { createGoogleGenerativeAI };
export { createGoogleGenerativeAI as customGoogle };
export { createGoogleGenerativeAI } from '@ai-sdk/google';
export { createGoogleGenerativeAI as otherGoogle } from 'other-provider';
export type { GoogleGenerativeAIProviderOptions } from '@ai-sdk/google';
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
