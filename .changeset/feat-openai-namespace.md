---
'@ai-sdk/openai': minor
---

feat (provider/openai): add namespace tool for grouping related tools

Added `openai.tools.namespace()` provider tool that lets you group related tools
under a logical container. Tools within a namespace can have `defer_loading: true`
to be lazily loaded via tool_search. This is useful for organizing tools from
different MCP servers or tool providers.

Usage:
```ts
const result = await streamText({
  model: openai('gpt-5.4'),
  tools: {
    myTools: openai.tools.namespace({
      name: 'mcp_github',
      description: 'Tools from GitHub MCP server',
      tools: [
        { type: 'function', name: 'create_issue', description: '...', defer_loading: true, parameters: { ... } },
        { type: 'function', name: 'list_repos', description: '...', defer_loading: true, parameters: { ... } },
      ],
    }),
    toolSearch: openai.tools.toolSearch(),
  },
});
```
