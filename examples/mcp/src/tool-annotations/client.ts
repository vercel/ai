import { openai } from '@ai-sdk/openai';
import {
  createMCPClient,
  getMCPToolAnnotations,
  isMCPToolCall,
  type MCPClient,
} from '@ai-sdk/mcp';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { generateText, isStepCount } from 'ai';
import 'dotenv/config';

async function main() {
  const transport = new StreamableHTTPClientTransport(
    new URL('http://localhost:8086/mcp'),
  );

  const mcpClient: MCPClient = await createMCPClient({
    transport,
    clientName: 'tool-annotations-example-client',
  });

  try {
    const tools = await mcpClient.tools();

    const result = await generateText({
      model: openai('gpt-4o-mini'),
      tools,
      // A single approval function decides for every tool call. Use
      // `isMCPToolCall` to scope the MCP-specific branch, then read the typed
      // behavioral hints with `getMCPToolAnnotations`. Non-MCP tools are handled
      // in the else branch and are never touched by the MCP logic.
      toolApproval: ({ toolCall }) => {
        if (isMCPToolCall(toolCall)) {
          const annotations = getMCPToolAnnotations(toolCall);

          // Read-only MCP tools run automatically.
          if (annotations?.readOnlyHint === true) {
            return 'approved';
          }

          // Destructive MCP tools would prompt a human via 'user-approval' in a
          // real app. We auto-deny so the example runs non-interactively.
          if (annotations?.destructiveHint === true) {
            return {
              type: 'denied',
              reason: 'destructive tool blocked by policy',
            };
          }

          // MCP tool the server gave no hints for: default conservatively.
          return 'user-approval';
        }

        // Non-MCP tools: your own policy goes here. This example has none, so we
        // let them run.
        return 'approved';
      },
      prompt:
        'Read the status of order order_123, then cancel order order_123.',
      stopWhen: isStepCount(5),
    });

    for (const step of result.steps) {
      for (const part of step.content) {
        if (part.type === 'tool-approval-response') {
          const annotations = getMCPToolAnnotations(part.toolCall);
          console.log(
            `Tool "${part.toolCall.toolName}" ` +
              `(readOnlyHint=${annotations?.readOnlyHint ?? '(none)'}, ` +
              `destructiveHint=${annotations?.destructiveHint ?? '(none)'}) ` +
              `was automatically ${part.approved ? 'approved' : 'denied'}` +
              (part.reason != null ? ` — ${part.reason}` : ''),
          );
        }
      }
    }

    console.log(`\nFINAL ANSWER: ${result.text}`);
  } finally {
    await mcpClient.close();
  }
}

main().catch(console.error);
