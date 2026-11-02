import { createGateway } from '@ai-sdk/gateway';
import { createGoogle } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { Experimental_DecisionUnsupportedQuestionTypeError } from '@ai-sdk/provider';
import { afterEach, expect, it, vi } from 'vitest';
import { decide } from './decide';

afterEach(() => vi.unstubAllGlobals());

it.each(['openai', 'google', 'gateway'] as const)(
  'rejects box questions in %s before downloading files or calling the provider',
  async provider => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const model = {
      openai: createOpenAI({ apiKey: 'test', fetch }).decisionModel('test'),
      google: createGoogle({ apiKey: 'test', fetch }).decisionModel('test'),
      gateway: createGateway({ apiKey: 'test', fetch }).decisionModel('test'),
    }[provider];
    const doDecide = vi.spyOn(model, 'doDecide');
    vi.stubGlobal('fetch', fetch);
    await expect(
      decide({
        model,
        state: [
          {
            type: 'file',
            mediaType: 'image/png',
            data: new URL('https://example.com/cat.png'),
          },
        ],
        questions: { target: { type: 'box', instructions: 'The cat' } },
      }),
    ).rejects.toBeInstanceOf(Experimental_DecisionUnsupportedQuestionTypeError);
    expect(doDecide).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  },
);
