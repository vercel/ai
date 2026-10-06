---
'@ai-sdk/provider': patch
'@ai-sdk/provider-utils': patch
'ai': patch
'@ai-sdk/alibaba': patch
'@ai-sdk/amazon-bedrock': patch
'@ai-sdk/anthropic': patch
'@ai-sdk/cohere': patch
'@ai-sdk/deepseek': patch
'@ai-sdk/fireworks': patch
'@ai-sdk/google': patch
'@ai-sdk/groq': patch
'@ai-sdk/mistral': patch
'@ai-sdk/moonshotai': patch
'@ai-sdk/open-responses': patch
'@ai-sdk/openai-compatible': patch
'@ai-sdk/openai': patch
'@ai-sdk/perplexity': patch
'@ai-sdk/xai': patch
---

feat(provider): add a portable `max` reasoning level with native provider mappings, compatibility coercions, and budget-based fallback support.

Compatibility notes:

- **TypeScript source compatibility:** Adding `max` widens `LanguageModelV4CallOptions['reasoning']` and the derived `ReasoningLevel` type. Third-party providers and consumers with exhaustive switches or `Record<ReasoningLevel, ...>` mappings must handle `max` before upgrading. Ordinary calls using existing reasoning levels remain accepted.
- **Amazon Bedrock:** Existing Nova 2 calls using portable `reasoning: 'xhigh'` now send `maxReasoningEffort: 'high'` instead of the unsupported `'max'`, and return a compatibility warning. Anthropic and OpenAI Bedrock effort mappings retain their existing `xhigh` behavior. Partial Bedrock reasoning configurations continue to preserve explicit values and derive missing fields; explicit effort/budget overrides and disabled thinking no longer emit warnings for portable mappings that are not sent.
- **Fireworks:** Existing portable `minimal` and `xhigh` calls keep their request mappings to `low` and `high`, respectively, and now return compatibility warnings in generation and streaming results. Portable `max` maps to `high` with the same warning behavior.

**Release classification:** This remains a patch changeset under the repository's explicit release policy, which uses patch releases for both fixes and features. The TypeScript source-compatibility caveat for exhaustive consumers is disclosed above. Maintainers can override this classification with a `major` label if they decide to align the provider-spec addition with a future AI SDK major release.
