---
'@ai-sdk/openai': patch
'@ai-sdk/google': patch
'@ai-sdk/anthropic': patch
'@ai-sdk/groq': patch
'@ai-sdk/moonshotai': patch
'@ai-sdk/xai': patch
---

Map shared `reasoning: 'none'` to the lowest supported setting for known models that cannot disable reasoning: OpenAI GPT-6/Astra, original GPT-5, GPT-5 Pro, o3/o3-mini/o4-mini; Google Gemini 2.5 Pro and 3/3.1 Pro; Anthropic Fable 5 and Mythos 5/Preview; Groq GPT-OSS; Moonshot Kimi K3; and xAI Grok 4.5/4.6. Also support disabling reasoning on Groq Qwen 3.8.

Explicit provider reasoning settings retain precedence and existing validation. Omitted reasoning, `provider-default`, and unknown-model behavior are unchanged. Google explicit thinking budgets or levels suppress shared derivation to avoid conflicting controls; display-only options still allow shared reasoning. Gemini 3/3.1 Pro also maps `minimal` to its supported minimum, `low`.

Minimum fallbacks can still produce reasoning tokens. OpenAI Responses continues to default summaries to `detailed` for a resolved non-`none` effort; set `reasoningSummary: null` to opt out.
