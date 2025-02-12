import { generateText, streamText } from 'ai';
import { expect, it } from 'vitest';
import type { GoogleGenerativeAIProviderMetadata } from '@ai-sdk/google';
import { describeIfCapability } from '../capability-test-utils';
import type { TestFunction } from './index';

const verifyGroundingMetadata = (groundingMetadata: any) => {
  expect(Array.isArray(groundingMetadata?.webSearchQueries)).toBe(true);
  expect(groundingMetadata?.webSearchQueries?.length).toBeGreaterThan(0);

  // Verify search entry point exists
  expect(groundingMetadata?.searchEntryPoint?.renderedContent).toBeDefined();

  // Verify grounding supports
  expect(Array.isArray(groundingMetadata?.groundingSupports)).toBe(true);
  const support = groundingMetadata?.groundingSupports?.[0];
  expect(support?.segment).toBeDefined();
  expect(Array.isArray(support?.groundingChunkIndices)).toBe(true);
  expect(Array.isArray(support?.confidenceScores)).toBe(true);
};

const verifySafetyRatings = (safetyRatings: any[]) => {
  expect(Array.isArray(safetyRatings)).toBe(true);
  expect(safetyRatings?.length).toBeGreaterThan(0);

  // Verify each safety rating has required properties
  safetyRatings?.forEach(rating => {
    expect(rating.category).toBeDefined();
    expect(rating.probability).toBeDefined();
    expect(typeof rating.probabilityScore).toBe('number');
    expect(rating.severity).toBeDefined();
    expect(typeof rating.severityScore).toBe('number');
  });
};

export const run: TestFunction<'searchGrounding'> = ({
  model,
  capabilities,
}) => {
  describeIfCapability(
    capabilities,
    ['searchGrounding'],
    'Search Grounding',
    () => {
      it('should include search grounding metadata in response when search grounding is enabled', async () => {
        const result = await generateText({
          model,
          prompt: 'What is the current population of Tokyo?',
        });

        expect(result.text).toBeTruthy();
        expect(result.text.toLowerCase()).toContain('tokyo');
        expect(result.usage?.totalTokens).toBeGreaterThan(0);

        const metadata = result.providerMetadata?.google as
          | GoogleGenerativeAIProviderMetadata
          | undefined;
        verifyGroundingMetadata(metadata?.groundingMetadata);
      });

      it('should include search grounding metadata when streaming with search grounding enabled', async () => {
        const result = streamText({
          model,
          prompt: 'What is the current population of Tokyo?',
        });

        const chunks: string[] = [];
        for await (const chunk of result.textStream) {
          chunks.push(chunk);
        }

        const metadata = (await result.providerMetadata)?.google as
          | GoogleGenerativeAIProviderMetadata
          | undefined;

        const completeText = chunks.join('');
        expect(completeText).toBeTruthy();
        expect(completeText.toLowerCase()).toContain('tokyo');
        expect((await result.usage)?.totalTokens).toBeGreaterThan(0);

        verifyGroundingMetadata(metadata?.groundingMetadata);
      });

      it('should include safety ratings in response when search grounding is enabled', async () => {
        const result = await generateText({
          model,
          prompt: 'What is the current population of Tokyo?',
        });

        const metadata = result.providerMetadata?.google as
          | GoogleGenerativeAIProviderMetadata
          | undefined;
        verifySafetyRatings(metadata?.safetyRatings ?? []);
      });

      it('should include safety ratings when streaming with search grounding enabled', async () => {
        const result = streamText({
          model,
          prompt: 'What is the current population of Tokyo?',
        });

        for await (const _ of result.textStream) {
          // consume the stream
        }

        const metadata = (await result.providerMetadata)?.google as
          | GoogleGenerativeAIProviderMetadata
          | undefined;

        verifySafetyRatings(metadata?.safetyRatings ?? []);
      });
    },
  );
};
