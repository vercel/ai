// @ts-nocheck provider packages are not codemod dependencies.
import {
  createGoogleGenerativeAI,
  createGoogleGenerativeAI as makeGoogleGenerativeAI,
  createGoogleGenerativeAI as makeGoogle,
  type GoogleGenerativeAIProvider,
  type GoogleGenerativeAIProvider as LegacyGoogleGenerativeAIProvider,
} from '@ai-sdk/google';
import { createGoogleGenerativeAI as createOtherProvider } from 'other-provider';

export const provider: GoogleGenerativeAIProvider = createGoogleGenerativeAI();
export const aliasedProvider = makeGoogleGenerativeAI();
export const differentlyAliasedProvider = makeGoogle();
export const otherProvider = createOtherProvider();
export let legacyProvider: LegacyGoogleGenerativeAIProvider;

export function createWithShadowedBinding(
  createGoogleGenerativeAI: () => unknown,
) {
  return createGoogleGenerativeAI();
}

export const CustomGoogleGenerativeAI = {};
