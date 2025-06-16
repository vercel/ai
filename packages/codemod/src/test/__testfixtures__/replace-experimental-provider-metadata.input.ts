// @ts-nocheck
import { streamObject, generateText, streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

// Basic usage - streamObject
const result1 = await streamObject({
  model: anthropic('claude-3-5-sonnet-latest'),
  experimental_providerMetadata: {
    anthropic: {
      thinking: { type: 'enabled', budgetTokens: 5000 },
    }
  },
  prompt: 'Generate an object'
});

// Basic usage - generateText
const result2 = await generateText({
  model: anthropic('claude-3-5-sonnet-latest'),
  experimental_providerMetadata: {
    anthropic: {
      thinking: { type: 'enabled', budgetTokens: 3000 },
    }
  },
  prompt: 'Hello world'
});

// With other properties
const result3 = await streamText({
  model: anthropic('claude-3-5-sonnet-latest'),
  prompt: 'Test prompt',
  experimental_providerMetadata: {
    anthropic: {
      thinking: { type: 'enabled', budgetTokens: 2000 },
    }
  },
  temperature: 0.7
});

// Multiple AI methods in same file
const result4 = await generateText({
  model: anthropic('claude-3-5-sonnet-latest'),
  experimental_providerMetadata: {
    anthropic: {
      thinking: { type: 'disabled' },
    }
  },
  prompt: 'Another test'
});

// Non-AI method call (should not be transformed)
const otherResult = someOtherFunction({
  experimental_providerMetadata: {
    anthropic: {
      thinking: { type: 'enabled' },
    }
  }
});

// Already has providerOptions (edge case)
const result5 = await streamObject({
  model: anthropic('claude-3-5-sonnet-latest'),
  providerOptions: {
    anthropic: {
      existing: true
    }
  },
  experimental_providerMetadata: {
    anthropic: {
      thinking: { type: 'enabled', budgetTokens: 1000 },
    }
  }
}); 