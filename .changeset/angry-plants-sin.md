---
'@ai-sdk/amazon-bedrock': major
---

### Language Model settings have been converted to providerOptions

Before:

```ts
import { bedrock } from "@ai-sdk/bedrock";
import { generateText } from "ai";

await generateText({
  model: bedrock("anthropic.claude-v2", {
    additionalModelRequestFields: {
      foo: 'bar'
    }
  }),
  prompt,
});
```

After:

```ts
import { bedrock } from "@ai-sdk/bedrock";
import { generateText } from "ai";

await generateText({
  model: bedrock("anthropic.claude-v2"),

  providerOptions: {
    bedrock: {
      additionalModelRequestFields: {
        foo: 'bar'
      }
    }
  },

  prompt,
});
```

Pull Request: https://github.com/vercel/ai/issues/5666
