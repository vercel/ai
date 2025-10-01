# MCP Resources Example

This example demonstrates the MCP Resources support in the AI SDK using the `nostr-explore-mcp` server.

## Running the Example

```bash
# From the ai monorepo root
npx tsx packages/ai/examples/mcp-resources-example.ts
```

Or from the `packages/ai` directory:

```bash
npx tsx examples/mcp-resources-example.ts
```

## What This Example Tests

1. **Listing Resources** - Discovers all available resources from the MCP server
2. **Listing Resource Templates** - Discovers dynamic resource URI templates
3. **Reading Resources** - Fetches the actual content of a specific resource
4. **Resource-to-Tool Conversion** - Demonstrates how resources can be exposed as AI SDK tools
5. **Template Support** - Shows how resource templates work

## Expected Output

The example will:
- Connect to the nostr-explore-mcp server via stdio
- List all available resources with their metadata
- Read content from the first available resource
- Show how resources are converted to tools
- Clean up and close the connection

## Features Demonstrated

- ✅ `listResources()` with pagination support
- ✅ `listResourceTemplates()` for dynamic resources
- ✅ `readResource()` to fetch resource content
- ✅ `tools({ includeResources: true })` for resource-tool conversion
- ✅ Proper client lifecycle management (init and close)
