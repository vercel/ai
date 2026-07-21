import { readFileSync } from 'node:fs';
import type {
  LanguageModelV4Prompt,
  SharedV4ProviderMetadata,
  SharedV4Warning,
} from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import {
  convertToGoogleMessages,
  SKIP_THOUGHT_SIGNATURE_VALIDATOR,
} from './convert-to-google-messages';

type Fixture = {
  prompt: string;
  toolCalls: Array<{
    toolCallId: string;
    toolName: string;
    input: unknown;
    providerMetadata: SharedV4ProviderMetadata | null;
  }>;
};

describe('issue #16298: Gemini 3 parallel tool-call thought signatures', () => {
  it('does not warn or inject a sentinel when the first parallel call is signed', () => {
    const fixture = JSON.parse(
      readFileSync(
        new URL(
          './__fixtures__/issue-16298-gemini3-parallel-tool-calls.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ) as Fixture;
    const warnings: SharedV4Warning[] = [];
    const prompt: LanguageModelV4Prompt = [
      {
        role: 'user',
        content: [{ type: 'text', text: fixture.prompt }],
      },
      {
        role: 'assistant',
        content: fixture.toolCalls.map(call => ({
          type: 'tool-call' as const,
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          input: call.input,
          providerOptions: call.providerMetadata ?? undefined,
        })),
      },
    ];

    const result = convertToGoogleMessages(prompt, {
      isGemini3Model: true,
      providerOptionsNames: ['googleVertex', 'vertex'],
      onWarning: warning => warnings.push(warning),
    });

    expect(warnings).toEqual([]);
    expect(result.contents[1].parts).not.toContainEqual(
      expect.objectContaining({
        thoughtSignature: SKIP_THOUGHT_SIGNATURE_VALIDATOR,
      }),
    );
  });
});
