// @ts-nocheck provider packages are not codemod dependencies.
import {
  createGoogle,
  createGoogle as makeGoogleGenerativeAI,
  createGoogle as makeGoogle,
  type GoogleProvider,
  type GoogleProvider as LegacyGoogleGenerativeAIProvider,
} from '@ai-sdk/google';
import { createGoogleGenerativeAI as createOtherProvider } from 'other-provider';

export const provider: GoogleProvider = createGoogle();
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
