---
'@ai-sdk/deepinfra': patch
---

fix: correct token usage calculation for Gemini/Gemma models

DeepInfra's API returns incorrect token usage data for Gemini/Gemma models where completion_tokens is smaller than reasoning_tokens, violating the OpenAI-compatible spec. This resulted in negative text token counts.

The fix detects when reasoning_tokens > completion_tokens and corrects completion_tokens to equal reasoning_tokens, ensuring accurate token usage reporting.
