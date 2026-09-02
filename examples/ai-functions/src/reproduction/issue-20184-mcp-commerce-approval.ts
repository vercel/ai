import { createMCPClient, type MCPTransport } from '@ai-sdk/mcp';
import { streamText, type ToolApprovalConfiguration, type ToolSet } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';
import { InMemoryTransport } from '../../../mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/inMemory.js';
import { McpServer } from '../../../mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js';

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 1,
    text: 1,
    reasoning: undefined,
  },
};

function submitOrderModel() {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        {
          type: 'tool-call' as const,
          toolCallId: 'submit-order-call',
          toolName: 'submit_order',
          input: JSON.stringify({ totalCents: 2500 }),
        },
        {
          type: 'finish' as const,
          finishReason: { unified: 'tool-calls' as const, raw: undefined },
          usage,
        },
      ]),
    }),
  });
}

async function runToolCall<TOOLS extends ToolSet>({
  tools,
  toolApproval,
}: {
  tools: TOOLS;
  toolApproval?: ToolApprovalConfiguration<TOOLS, unknown>;
}) {
  let approvalEvents = 0;
  const result = streamText({
    model: submitOrderModel(),
    tools,
    ...(toolApproval == null ? {} : { toolApproval }),
    instructions: 'You are a helpful chatbot',
    prompt: 'Submit the order for 2500 cents.',
  });

  for await (const part of result.fullStream) {
    if (part.type === 'tool-approval-request') {
      approvalEvents++;
    }
  }

  return approvalEvents;
}

async function main() {
  let orderCount = 0;
  let totalCents = 0;

  const server = new McpServer({
    name: 'storefront-reproduction',
    version: '1.0.0',
  });

  server.registerTool(
    'get_product',
    {
      description: 'Read a product.',
      inputSchema: { id: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => ({
      content: [{ type: 'text', text: `Product ${id}` }],
    }),
  );

  server.registerTool(
    'create_cart',
    {
      description: 'Create a shopping cart.',
      inputSchema: {},
      annotations: { readOnlyHint: false },
    },
    async () => ({
      content: [{ type: 'text', text: 'Cart created' }],
    }),
  );

  server.registerTool(
    'submit_order',
    {
      description: 'Submit an order and charge the customer.',
      inputSchema: { totalCents: z.number().int().positive() },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
      },
    },
    async ({ totalCents: submittedTotal }) => {
      orderCount++;
      totalCents += submittedTotal;
      return {
        content: [{ type: 'text', text: 'Order submitted' }],
      };
    },
  );

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const mcpClient = await createMCPClient({
    transport: clientTransport as unknown as MCPTransport,
  });

  try {
    const tools = await mcpClient.tools();
    const submitOrderTool = tools.submit_order as {
      metadata?: Record<string, unknown>;
      needsApproval?: unknown;
    };

    const orderCountBeforeUngatedCall = orderCount;
    const ungatedApprovalEvents = await runToolCall({ tools });
    const ungatedOrderDelta = orderCount - orderCountBeforeUngatedCall;

    const policyOpaPath = '../../../../packages/policy-opa/dist/index.js';
    const { wrapMcpTools } = (await import(policyOpaPath)) as {
      wrapMcpTools: <TOOLS extends ToolSet>(
        tools: TOOLS,
        approval: ToolApprovalConfiguration<TOOLS, unknown>,
      ) => {
        tools: TOOLS;
        toolApproval: ToolApprovalConfiguration<TOOLS, unknown>;
      };
    };
    const wrapped = wrapMcpTools(tools, {});
    const orderCountBeforeGatedCall = orderCount;
    const gatedApprovalEvents = await runToolCall(wrapped);
    const gatedOrderDelta = orderCount - orderCountBeforeGatedCall;

    console.log(
      JSON.stringify(
        {
          ungated: {
            orderCreated: ungatedOrderDelta === 1,
            totalCents,
            approvalEvents: ungatedApprovalEvents,
          },
          conversion: {
            hasNeedsApproval: submitOrderTool.needsApproval != null,
            metadata: submitOrderTool.metadata,
          },
          wrappedGate: {
            orderCreated: gatedOrderDelta !== 0,
            approvalEvents: gatedApprovalEvents,
          },
        },
        null,
        2,
      ),
    );

    if (gatedOrderDelta !== 0 || gatedApprovalEvents !== 1) {
      throw new Error(
        'Control arm failed: explicit MCP fallback gate did not block execution',
      );
    }

    if (ungatedOrderDelta === 1 && ungatedApprovalEvents === 0) {
      console.error(
        'ISSUE_20184_REPRODUCED: destructive submit_order executed without approval',
      );
      process.exitCode = 1;
    }
  } finally {
    await mcpClient.close();
    await server.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
