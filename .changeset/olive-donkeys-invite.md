---
'@ai-sdk/openai': patch
---

fix(openai): support built-in and provider-defined tools in the Responses `allowedTools` option

`allowedTools` emitted every allow-list entry as `{ type: 'function', name }`, but OpenAI identifies
built-in tools by type. Allow-listing a declared provider-defined tool (web search, image generation,
MCP, custom, ...) therefore failed with `Tool choice '<name>' not found in 'tools' parameter`. Entries
are now derived from the declared tool, including the MCP server label and custom tool name.

Tools that OpenAI cannot allow-list (the tool search tool, deferred tools, and namespaced tools) are
dropped from the allow-list with a warning, and an error is thrown if that would leave the allow-list
empty rather than silently sending an unrestricted request.

Ambiguous names are now reported instead of resolved silently. A name that matches both a declared tool
and another tool's provider tool name resolves to the declared tool and warns; a provider tool name
shared by several tools in the same request (two MCP servers, for example) is dropped with a warning.
A name that matches no declared tool keeps its existing behavior and is now warned about.
