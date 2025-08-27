---
'@ai-sdk/codemod': patch
---

fix(codemod): Language Model V2 Import

Migration: https://ai-sdk.dev/docs/migration-guides/migration-guide-5-0#language-model-v2-import

Codemod behavior before the fix

```diff
- import { LanguageModelV2 } from 'ai';
+ import { LanguageModelV2 } from '@ai-sdk/provider';
```

After

```diff
+ import { LanguageModelV2 } from 'ai';
- import { LanguageModelV2 } from '@ai-sdk/provider';
```
