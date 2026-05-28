/**
 * LogicNodes MCP Integration — Vercel AI SDK Route Handler
 * =========================================================
 * Demonstrates how to integrate LogicNodes deterministic compute workers
 * as tools in a Next.js API route using the Vercel AI SDK and the
 * Model Context Protocol (MCP) client.
 *
 * LogicNodes provides 2,300+ cryptographically-signed microservices:
 * gas oracles, compliance sentries, identity verification, ZK attestation,
 * DeFi data, and more — all callable via MCP or direct REST.
 *
 * Install:
 *   npm install ai @ai-sdk/openai @modelcontextprotocol/sdk
 *
 * Add to your Next.js app at:
 *   app/api/logicnodes/route.ts
 *
 * Env vars:
 *   OPENAI_API_KEY=sk-...
 *   LOGICNODES_API_KEY=your_key_from_https://logicnodes.io/checkout  (optional)
 */

import { openai } from "@ai-sdk/openai";
import { streamText, tool } from "ai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";

export const runtime = "nodejs"; // MCP client requires Node.js runtime

const LOGICNODES_MCP_URL = "https://logicnodes.io/mcp";
const LOGICNODES_BASE = "https://logicnodes.io";
const LOGICNODES_API_KEY = process.env.LOGICNODES_API_KEY ?? "";

/** Build auth headers for direct REST calls */
function lnHeaders(): Record<string, string> {
  return LOGICNODES_API_KEY
    ? { Authorization: `Bearer ${LOGICNODES_API_KEY}` }
    : {};
}

// ---------------------------------------------------------------------------
// Option A: Statically defined tools (direct REST — no MCP server required)
// ---------------------------------------------------------------------------

const logicnodesTools = {
  /** Query the LogicNodes gas oracle — deterministic EIP-1559 gas estimates. */
  gasOracle: tool({
    description:
      "Query the LogicNodes gas oracle for deterministic EIP-1559 gas estimates on any EVM chain. " +
      "Returns a cryptographically-signed payload with base fee, priority fee, and max fee.",
    parameters: z.object({
      chain: z
        .string()
        .optional()
        .default("ethereum")
        .describe("Chain name: ethereum, base, polygon, arbitrum"),
    }),
    execute: async ({ chain }) => {
      const res = await fetch(`${LOGICNODES_BASE}/call/gas-oracle`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...lnHeaders() },
        body: JSON.stringify({ chain }),
      });
      return res.json();
    },
  }),

  /** On-chain compliance check for an agent action. */
  complianceSentry: tool({
    description:
      "Run an on-chain compliance check for an autonomous agent action via LogicNodes. " +
      "Returns a verifiable attestation of whether the action is permitted.",
    parameters: z.object({
      agentId: z
        .string()
        .describe("Agent wallet address or DID to check compliance for."),
      action: z.string().describe("Description of the action to verify."),
    }),
    execute: async ({ agentId, action }) => {
      const res = await fetch(`${LOGICNODES_BASE}/call/compliance-sentry`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...lnHeaders() },
        body: JSON.stringify({ agent_id: agentId, action }),
      });
      return res.json();
    },
  }),

  /** Current ETH/USD price, cryptographically signed. */
  ethPrice: tool({
    description:
      "Fetch the current ETH/USD price from LogicNodes. Output is cryptographically " +
      "signed and suitable for on-chain price verification.",
    parameters: z.object({}),
    execute: async () => {
      const res = await fetch(`${LOGICNODES_BASE}/call/eth-price`, {
        headers: lnHeaders(),
      });
      return res.json();
    },
  }),

  /** Anchor content on-chain via ZK attestation. */
  zkAttest: tool({
    description:
      "Anchor content on-chain via LogicNodes ZK attestation. Returns a verifiable " +
      "proof-of-existence anchored to Base L2. Useful for audit trails and compliance evidence.",
    parameters: z.object({
      content: z.string().describe("Text or JSON content to anchor on-chain."),
    }),
    execute: async ({ content }) => {
      const res = await fetch(`${LOGICNODES_BASE}/x402/zk-attest`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...lnHeaders() },
        body: JSON.stringify({ content }),
      });
      return res.json();
    },
  }),

  /** Trust graph score for an agent. */
  graphScore: tool({
    description:
      "Retrieve the LogicNodes trust graph score for an agent based on on-chain history.",
    parameters: z.object({
      agentId: z.string().describe("Agent wallet address or DID."),
    }),
    execute: async ({ agentId }) => {
      const res = await fetch(`${LOGICNODES_BASE}/graph/score/${agentId}`, {
        headers: lnHeaders(),
      });
      return res.json();
    },
  }),
};

// ---------------------------------------------------------------------------
// Option B: Dynamic tool discovery via MCP (connects to LogicNodes MCP server)
// ---------------------------------------------------------------------------

async function getMcpTools(): Promise<Record<string, unknown>> {
  const client = new Client({ name: "vercel-ai-logicnodes", version: "1.0" });
  const transport = new StreamableHTTPClientTransport(
    new URL(LOGICNODES_MCP_URL)
  );
  await client.connect(transport);

  const { tools } = await client.listTools();
  const mcpTools: Record<string, ReturnType<typeof tool>> = {};

  for (const t of tools) {
    mcpTools[t.name] = tool({
      description: t.description ?? t.name,
      parameters: z.object(
        Object.fromEntries(
          Object.entries(
            (t.inputSchema as { properties?: Record<string, unknown> })
              .properties ?? {}
          ).map(([k]) => [k, z.string().optional()])
        )
      ),
      execute: async (args) => {
        const result = await client.callTool({ name: t.name, arguments: args });
        return result.content;
      },
    });
  }

  return mcpTools;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  const { messages, useMcp = false } = await req.json();

  // Choose static tools or dynamic MCP tools
  const tools = useMcp
    ? ((await getMcpTools()) as typeof logicnodesTools)
    : logicnodesTools;

  const result = streamText({
    model: openai("gpt-4o"),
    system:
      "You are an autonomous on-chain agent assistant powered by LogicNodes " +
      "deterministic compute. Always check compliance before recommending " +
      "on-chain actions. Use gas oracle data for accurate cost estimates. " +
      "Anchor important decisions with ZK attestation.",
    messages,
    tools,
    maxSteps: 5,
  });

  return result.toDataStreamResponse();
}
