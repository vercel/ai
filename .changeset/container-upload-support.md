---
"@ai-sdk/anthropic": minor
"@ai-sdk/provider": minor
"@ai-sdk/provider-utils": minor
"ai": minor
---

feat(anthropic): add support for container_upload content type

Add support for the `container_upload` content type which enables editing existing documents uploaded via Anthropic's Files API when using skills (docx, pptx, xlsx, pdf editing).

**Usage:**

```typescript
import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';

const result = await generateText({
  model: anthropic('claude-sonnet-4-5'),
  tools: {
    code_execution: anthropic.tools.codeExecution_20250825(),
  },
  messages: [{
    role: 'user',
    content: [
      { type: 'text', text: 'Add a new paragraph to this document' },
      {
        type: 'custom',
        providerOptions: {
          anthropic: {
            type: 'container_upload',
            fileId: 'file_xxx' // File ID from Anthropic Files API
          }
        }
      }
    ]
  }],
  providerOptions: {
    anthropic: {
      container: {
        skills: [{ type: 'anthropic', skillId: 'docx', version: 'latest' }],
      },
    },
  },
});
```
