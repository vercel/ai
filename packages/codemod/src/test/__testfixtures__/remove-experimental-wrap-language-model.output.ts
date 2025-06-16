// @ts-nocheck
import { wrapLanguageModel } from 'ai';
import { wrapLanguageModel as wrapModel } from 'ai';
import { openai } from '@ai-sdk/openai';

// Basic usage
const wrappedModel = wrapLanguageModel({
  model: openai('gpt-4'),
  middleware: {
    wrapGenerate: async ({ doGenerate, params }) => {
      return doGenerate();
    },
  },
});

// With alias import
const wrappedModel2 = wrapModel({
  model: openai('gpt-3.5-turbo'),
  middleware: {
    wrapGenerate: async ({ doGenerate, params }) => {
      return doGenerate();
    },
  },
});

// In function parameters
function createWrappedModel() {
  return wrapLanguageModel({
    model: openai('gpt-4'),
    middleware: {
      wrapGenerate: async ({ doGenerate, params }) => {
        return doGenerate();
      },
    },
  });
}

// Assigned to variable
const wrapperFn = wrapLanguageModel;

// Mixed with other imports
import { generateText, wrapLanguageModel as customWrap } from 'ai';

const model = customWrap({
  model: openai('gpt-4'),
  middleware: {},
});

// Should not affect non-ai imports
import { experimental_wrapLanguageModel as otherWrap } from 'other-library';

const otherWrapped = otherWrap();
