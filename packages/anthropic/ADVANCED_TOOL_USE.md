# Advanced Tool Use for Anthropic Claude Models

This document describes the advanced tool use features available in the AI SDK for Anthropic Claude models. These features enable more efficient and accurate tool usage patterns, reducing token consumption and improving model accuracy.

> **Note**: These features are experimental and currently only supported by Anthropic Claude models. Using them with other providers will generate warnings.

## Overview

The AI SDK now supports three advanced tool use patterns introduced by Anthropic:

1. **Tool Search Tool** - Dynamically discover tools on-demand
2. **Programmatic Tool Calling** - Orchestrate tool execution through code
3. **Tool Use Examples** - Demonstrate correct usage patterns

## Table of Contents

- [Tool Search Tool](#tool-search-tool)
- [Programmatic Tool Calling](#programmatic-tool-calling)
- [Tool Use Examples](#tool-use-examples)
- [API Reference](#api-reference)
- [Provider Support](#provider-support)
- [Best Practices](#best-practices)

---

## Tool Search Tool

The Tool Search Tool enables Claude to dynamically discover tools on-demand rather than loading all tool definitions upfront. This is particularly useful when you have many tools (10+) that would otherwise consume a lot of context tokens.

### Key Benefits

- **85% reduction in token usage** - From ~77K to ~8.7K tokens in typical scenarios
- **Improved accuracy** - Opus 4 accuracy improved from 49% to 74%; Opus 4.5 from 79.5% to 88.1%
- **Works with prompt caching** - Deferred tools aren't in the initial prompt

### When to Use

- Tool definitions consuming >10K tokens
- 10+ tools available
- Multiple MCP servers with many tools

### Usage

```typescript
import { anthropic } from '@ai-sdk/anthropic';
import { generateText, tool } from 'ai';
import { z } from 'zod';

const result = await generateText({
  model: anthropic('claude-sonnet-4-5-20250929'),
  tools: {
    // Enable the Tool Search Tool
    tool_search_tool_regex: anthropic.tools.toolSearch_20251119(),

    // Mark tools as deferred - they won't be loaded initially
    createPullRequest: tool({
      description: 'Create a GitHub pull request',
      parameters: z.object({
        title: z.string(),
        body: z.string(),
        base: z.string(),
        head: z.string(),
      }),
      execute: async (args) => {
        // Implementation
        return { success: true, prNumber: 123 };
      },
      // This tool will be discovered via Tool Search
      experimental_deferLoading: true,
    }),

    listIssues: tool({
      description: 'List GitHub issues',
      parameters: z.object({
        state: z.enum(['open', 'closed', 'all']),
        labels: z.array(z.string()).optional(),
      }),
      execute: async (args) => {
        // Implementation
        return { issues: [] };
      },
      experimental_deferLoading: true,
    }),

    // Keep frequently-used tools loaded by NOT setting deferLoading
    getCurrentUser: tool({
      description: 'Get the current authenticated user',
      parameters: z.object({}),
      execute: async () => {
        return { username: 'developer' };
      },
    }),
  },
  prompt: 'Create a PR for the feature branch',
});
```

### How It Works

1. Claude sees only the Tool Search Tool (~500 tokens) plus non-deferred tools
2. When Claude needs capabilities, it searches for relevant tools using regex patterns
3. Matching tools are expanded into full definitions
4. Claude can then use the discovered tools

---

## Programmatic Tool Calling

Programmatic Tool Calling allows Claude to orchestrate tool execution through code rather than individual API round-trips. This keeps intermediate results out of Claude's context, reducing token usage and enabling complex multi-step workflows.

### Key Benefits

- **37% token reduction** - 43,588 to 27,297 tokens on complex tasks
- **Reduced latency** - Eliminates multiple inference passes
- **Improved accuracy** - Explicit orchestration logic

### When to Use

- Large datasets where only aggregates are needed
- Multi-step workflows (3+ tool calls)
- Parallel operations that can run concurrently
- Data filtering/transformation scenarios

### Usage

```typescript
import { anthropic } from '@ai-sdk/anthropic';
import { generateText, tool } from 'ai';
import { z } from 'zod';

const result = await generateText({
  model: anthropic('claude-sonnet-4-5-20250929'),
  tools: {
    // Enable code execution tool (required for programmatic tool calling)
    code_execution: anthropic.tools.codeExecution_20250825(),

    // Tools that can only be called from code execution
    getTeamMembers: tool({
      description: 'Get team members for a department',
      parameters: z.object({
        department: z.string(),
      }),
      execute: async (args) => {
        return [
          { id: '1', name: 'Alice', level: 'senior' },
          { id: '2', name: 'Bob', level: 'junior' },
        ];
      },
      // Only allow calls from code execution context
      experimental_allowedCallers: ['code_execution_20250825'],
    }),

    getBudgetByLevel: tool({
      description: 'Get budget limits by employee level',
      parameters: z.object({
        level: z.string(),
      }),
      execute: async (args) => {
        return { travel_limit: args.level === 'senior' ? 5000 : 2000 };
      },
      experimental_allowedCallers: ['code_execution_20250825'],
    }),

    getExpenses: tool({
      description: 'Get expenses for an employee',
      parameters: z.object({
        employeeId: z.string(),
        quarter: z.string(),
      }),
      execute: async (args) => {
        return [
          { type: 'travel', amount: 1500 },
          { type: 'equipment', amount: 300 },
        ];
      },
      experimental_allowedCallers: ['code_execution_20250825'],
    }),
  },
  prompt:
    'Check if any engineering team members exceeded their Q3 travel budget',
});
```

### How It Works

1. Claude generates Python code that orchestrates multiple tool calls
2. The code runs in a sandboxed environment
3. Intermediate results stay within the code execution context
4. Only the final output enters Claude's context

---

## Tool Use Examples

Tool Use Examples help Claude understand correct usage patterns beyond what JSON Schema can express. They demonstrate proper parameter formats, combinations, and domain-specific conventions.

### Key Benefits

- **Accuracy improved from 72% to 90%** on complex parameter handling
- Better handling of nested objects
- Clearer understanding of optional vs. required fields
- Domain-specific format conventions

### When to Use

- Complex nested structures
- Many optional parameters
- Domain-specific API conventions (e.g., ID formats)
- Similar tools that need differentiation

### Usage

```typescript
import { anthropic } from '@ai-sdk/anthropic';
import { generateText, tool } from 'ai';
import { z } from 'zod';

const result = await generateText({
  model: anthropic('claude-sonnet-4-5-20250929'),
  tools: {
    createTicket: tool({
      description: 'Create a support ticket',
      parameters: z.object({
        title: z.string(),
        priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
        labels: z.array(z.string()).optional(),
        reporter: z
          .object({
            id: z.string(),
            name: z.string(),
            contact: z
              .object({
                email: z.string().optional(),
                phone: z.string().optional(),
              })
              .optional(),
          })
          .optional(),
        dueDate: z.string().optional(),
        escalation: z
          .object({
            level: z.number(),
            notifyManager: z.boolean(),
            slaHours: z.number(),
          })
          .optional(),
      }),
      execute: async (args) => {
        return { ticketId: 'TKT-12345' };
      },
      // Examples showing different usage patterns
      experimental_inputExamples: [
        // Full example with all fields
        {
          title: 'Login page returns 500 error',
          priority: 'critical',
          labels: ['bug', 'authentication', 'production'],
          reporter: {
            id: 'USR-12345',
            name: 'Jane Smith',
            contact: {
              email: 'jane@acme.com',
              phone: '+1-555-0123',
            },
          },
          dueDate: '2024-11-06',
          escalation: {
            level: 2,
            notifyManager: true,
            slaHours: 4,
          },
        },
        // Partial example with some optional fields
        {
          title: 'Add dark mode support',
          labels: ['feature-request', 'ui'],
        },
        // Minimal example with only required fields
        {
          title: 'Update API documentation',
        },
      ],
    }),
  },
  prompt: 'Create a critical bug ticket for the payment gateway being down',
});
```

### Best Practices for Examples

1. **Show progression**: Include minimal, partial, and full parameter examples
2. **Demonstrate formats**: Show expected ID formats (e.g., "USR-12345")
3. **Clarify conventions**: Use realistic values that match your domain
4. **Cover edge cases**: Include examples that clarify ambiguous usage

---

## API Reference

### Tool Properties

| Property                       | Type       | Description                                                      |
| ------------------------------ | ---------- | ---------------------------------------------------------------- |
| `experimental_deferLoading`    | `boolean`  | Defer loading this tool's definition until searched              |
| `experimental_allowedCallers`  | `string[]` | Restrict which contexts can call this tool                       |
| `experimental_inputExamples`   | `unknown[]`| Example inputs demonstrating correct usage                       |

### Provider-Defined Tools

| Tool                                         | Description                        |
| -------------------------------------------- | ---------------------------------- |
| `anthropic.tools.toolSearch_20251119()`      | Enable dynamic tool discovery      |
| `anthropic.tools.codeExecution_20250825()`   | Enable programmatic tool calling   |

### Beta Headers

The SDK automatically adds the `advanced-tool-use-2025-11-20` beta header when any of these features are used.

---

## Provider Support

| Feature                  | Anthropic | OpenAI | Google | Mistral |
| ------------------------ | --------- | ------ | ------ | ------- |
| `deferLoading`           | Yes       | No (warning) | No (warning) | No (warning) |
| `allowedCallers`         | Yes       | No (warning) | No (warning) | No (warning) |
| `inputExamples`          | Yes       | No (warning) | No (warning) | No (warning) |
| Tool Search Tool         | Yes       | No     | No     | No      |

When these features are used with unsupported providers, the SDK will:
1. Emit a warning in the response
2. Ignore the unsupported properties
3. Continue processing the tool as a standard function tool

---

## Best Practices

### 1. Strategic Layering

Address specific bottlenecks rather than implementing all features:
- **Context bloat** → Use Tool Search Tool
- **Intermediate data pollution** → Use Programmatic Tool Calling
- **Parameter errors** → Use Tool Use Examples

### 2. Tool Search Tool

- Keep frequently-used tools loaded (don't set `deferLoading`)
- Use descriptive tool names that match search patterns
- Consider grouping related tools with naming conventions

### 3. Programmatic Tool Calling

- Use for data aggregation where only results matter
- Combine with parallel operations for efficiency
- Keep the final output concise

### 4. Tool Use Examples

- Include 2-4 examples covering different usage patterns
- Show real-world parameter values
- Demonstrate both simple and complex cases

---

## Migration Guide

### From Standard Tool Definitions

Standard tool definitions continue to work unchanged. To adopt advanced features:

1. **Enable Tool Search** (if you have many tools):
   ```typescript
   // Add the tool search tool
   tool_search_tool_regex: anthropic.tools.toolSearch_20251119(),

   // Mark tools as deferred
   myTool: tool({
     // ... existing definition
     experimental_deferLoading: true,
   }),
   ```

2. **Enable Programmatic Calling** (for complex workflows):
   ```typescript
   // Add code execution tool
   code_execution: anthropic.tools.codeExecution_20250825(),

   // Restrict callers
   myDataTool: tool({
     // ... existing definition
     experimental_allowedCallers: ['code_execution_20250825'],
   }),
   ```

3. **Add Examples** (for complex parameters):
   ```typescript
   myComplexTool: tool({
     // ... existing definition
     experimental_inputExamples: [
       { /* example 1 */ },
       { /* example 2 */ },
     ],
   }),
   ```

---

## Troubleshooting

### Tool Search Not Finding Tools

- Ensure `experimental_deferLoading: true` is set on the tools
- Check that `toolSearch_20251119` is included in tools
- Verify tool descriptions are searchable

### Programmatic Calling Not Working

- Ensure `codeExecution_20250825` is included in tools
- Set `experimental_allowedCallers: ['code_execution_20250825']` on restricted tools
- Check that the model supports code execution

### Examples Not Affecting Behavior

- Ensure examples match the parameter schema
- Include diverse examples (minimal, partial, full)
- Use realistic values that reflect actual usage

---

## References

- [Anthropic Advanced Tool Use Blog Post](https://www.anthropic.com/engineering/advanced-tool-use)
- [AI SDK Documentation](https://sdk.vercel.ai)
- [Anthropic API Documentation](https://docs.anthropic.com)
