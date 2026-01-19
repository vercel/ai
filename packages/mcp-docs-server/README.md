# AI SDK MCP Docs Server

An MCP (Model Context Protocol) server that provides AI assistants with access to AI SDK documentation.

## Installation

```bash
npm install -g @ai-sdk/mcp-docs-server
```

## Usage

### Cursor

Add to your Cursor MCP configuration (`~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "ai-sdk-docs": {
      "command": "npx",
      "args": ["-y", "@ai-sdk/mcp-docs-server"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add ai-sdk-docs -- npx -y @ai-sdk/mcp-docs-server
```

Or add manually to your configuration:

```json
{
  "mcpServers": {
    "ai-sdk-docs": {
      "command": "npx",
      "args": ["-y", "@ai-sdk/mcp-docs-server"]
    }
  }
}
```

### OpenCode

Add to your `opencode.json`:

```json
{
  "mcp": {
    "ai-sdk-docs": {
      "command": "npx",
      "args": ["-y", "@ai-sdk/mcp-docs-server"]
    }
  }
}
```

### Windsurf

Add to your Windsurf MCP configuration:

```json
{
  "mcpServers": {
    "ai-sdk-docs": {
      "command": "npx",
      "args": ["-y", "@ai-sdk/mcp-docs-server"]
    }
  }
}
```

## Available Tools

### search_ai_sdk_docs

Search the AI SDK documentation by keyword or phrase.

```json
{
  "query": "how to stream text",
  "limit": 10
}
```

Returns matching documents with relevance scores (`high`, `medium`, `low`) and snippets.

### get_ai_sdk_doc

Get the full content of a specific documentation page. Large documents are paginated.

```json
{
  "path": "docs/03-ai-sdk-core/05-generating-text",
  "page": 1
}
```

### list_ai_sdk_docs

List available documentation pages, optionally filtered by section.

```json
{
  "section": "docs"
}
```

Sections: `docs`, `cookbook`, `providers`

## License

Apache-2.0
