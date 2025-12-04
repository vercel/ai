# Anthropic Advanced Tool Use (ATU)

This document describes the **Advanced Tool Use** extensions implemented in the
`@ai-sdk/anthropic` provider.  
It adds support for:

- Search-powered tool discovery (BM25 + Regex)
- Runtime tool registry
- `search-tool` definitions
- Programmatic tool selection by the model
- Tool examples & ranking metadata
- Future-ready compatibility with Anthropic's upcoming *“tool_search”* API

> This is an extension to the standard AI SDK Anthropic provider.  
> It is optional and must be explicitly enabled.

---

## 1. Enabling Advanced Tool Use

ATU is enabled when passing:

```ts
anthropic({ advancedToolUse: true });
````

Example:

```ts
import { createAnthropic } from '@ai-sdk/anthropic';

const anthropic = createAnthropic({
  advancedToolUse: true,
});
```

This will:

* Add `anthropic-beta: advanced-tool-use-2025-11-20` header
* Enable ATU-specific behaviors in `prepareTools()`
* Allow the `search-tool` mechanism to function

---

## 2. Registering Runtime Tools

Before a search tool can discover tools, you must register them:

```ts
anthropic.advancedTools.register({
  name: 'translate',
  description: 'Translate text between languages.',
  inputSchema: {
    type: 'object',
    properties: { text: { type: 'string' } },
    required: ['text'],
  },
  keywords: ['translate', 'language', 'convert'],
});
```

You can inspect registered tools:

```ts
anthropic.advancedTools.list();
```

Tools are stored inside:

```
packages/anthropic/src/runtime/tool-search/registry.ts
```

---

## 3. Creating a Search Tool

A search tool definition tells the model:

> “Ask me to find the best tool matching this query.”

Example:

```ts
const searchTool = anthropic.searchTool({
  name: 'tool_search_bm25_20251119',
  query: 'find a translation tool',
  searchType: 'tool_search_bm25_20251119',
  maxResults: 5,
  inputExamples: ['translate hello to french'],
});
```

The search tool:

* Executes the BM25+Regex hybrid engine
* Returns a ranked list of tools
* Allows the model to select the best match

---

## 4. Runtime Search Engine (BM25 + Regex)

Implemented under:

```
runtime/tool-search/
```

The engine:

* Scores tools with BM25 (semantic-ish)
* Scores tools with Regex (exact-term boost)
* Merges scores together
* Deduplicates and sorts
* Returns the best tools

Example usage:

```ts
import { runtimeToolSearch } from '../runtime/tool-search/search';

runtimeToolSearch('translate text', 3);
```

Output:

```ts
[
  { name: "translate", score: 12.4 },
  { name: "detect_language", score: 9.0 }
]
```

This is what powers the `search-tool`.

---

## 5. Model Usage Example

```ts
import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';

anthropic.advancedTools.register({
  name: 'translate',
  description: 'Translate text to any language.',
  inputSchema: { type: 'object', properties: { text: { type: 'string' } } },
  keywords: ['translate', 'language'],
});

const search = anthropic.searchTool({
  name: 'tool_search_bm25_20251119',
  query: 'translation capability',
  searchType: 'tool_search_bm25_20251119',
});

const result = await generateText({
  model: anthropic('claude-3-opus'),
  tools: [search],
  prompt: 'Translate "hello" to German.',
});
```

The model will:

1. Invoke the search tool
2. Receive tool rankings
3. Choose the best match (`translate`)
4. Call it with appropriate arguments

---

## 6. Tool Name Normalization

Anthropic sends tool names with version_suffixes:

```
tool_search_bm25_20251119
```

These are normalized internally to:

```
tool_search_bm25
```

This ensures:

* Stability across Anthropic API versions
* Correct matching inside AI SDK’s tool system

Normalization code lives in:

```
anthropic-messages-language-model.ts
```

---

## 7. ATU Integration in the Provider

The following new APIs are added to the Anthropic provider:

```ts
provider.advancedTools.register();
provider.advancedTools.list();
provider.searchTool();
```

New provider settings:

```ts
advancedToolUse?: boolean;
```

---

## 8. Limitations

* Search tools do **not** validate schemas at runtime
* Registered tools must provide a `name`
* Search queries must be short text strings
* Tool ranking depends heavily on `description` + `keywords`

---

## 9. Roadmap

This extension is designed to be compatible with:

* Anthropic’s future search-tool API
* Multi-step tool reasoning
* Multi-agent “skills containers”
* Automatic dynamic tool routing

Further improvements planned:

* Embedding-based tool search
* Automatic re-ranking with examples
* Model-feedback-enhanced tool routing

---

## 10. File Layout Reference

```
src/
  anthropic-provider.ts
  anthropic-messages-language-model.ts
  anthropic-prepare-tools.ts
  search-tool-definition.ts

  runtime/
    tool-search/
      registry.ts
      search.ts
      bm25.ts
      regex.ts
```