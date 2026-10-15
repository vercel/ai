// @ts-nocheck
import { vertex } from '@ai-sdk/google-vertex';
import { generateText } from 'ai';

// Already migrated namespace with a nested application key named google
const options = {
  providerOptions: {
    vertex: {
      labels: {
        google: 'synthetic',
      },
    },
  },
};

// Old namespace is renamed, nested payload keys are preserved
const result = await generateText({
  model: vertex('gemini-2.5-flash'),
  providerOptions: {
    vertex: {
      labels: {
        google: 'synthetic',
      },
      metadata: {
        tags: [{ google: true }],
      },
    },
  },
  prompt: 'Hello',
});

// A google key outside providerOptions is untouched
const config = {
  google: {
    projectId: 'my-project',
  },
  providerOptions: {
    vertex: {
      thinkingConfig: { thinkingBudget: 1024 },
    },
  },
};
