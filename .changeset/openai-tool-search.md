---
'@ai-sdk/openai': patch
---

feat(provider/openai): add tool_search and defer_loading support for chat models

Add native support for OpenAI's tool_search feature, which enables models to dynamically discover and select from a large set of tools. Currently available for gpt-5.4 models.

- New `toolSearch` provider option to enable tool_search
- Support for `deferLoading` on individual tool provider options to set `defer_loading` on function tools
