import { createMCPClient, type MCPClient } from '@ai-sdk/mcp';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { generateText, isStepCount } from 'ai';
import { openai } from '@ai-sdk/openai';
import 'dotenv/config';

/**
 * Example: Trust-gated agent interactions using TWZRD Agent Intel.
 *
 * TWZRD Agent Intel is a zero-install remote MCP server that provides
 * trust scoring and x402 payment verification for AI agents on Solana.
 *
 * MCP config: {"mcpServers": {"twzrd-agent-intel": {"url": "https://intel.twzrd.xyz/mcp"}}}
 */

const TWZRD_MCP_URL = 'https://intel.twzrd.xyz/mcp';

// Example Solana agent wallet to check
const AGENT_WALLET = 'D1QkbFJKiPsymJ65RKHhF6DFB8sPMfpBaFBzuHKfJGWi';
const TRUST_THRESHOLD = 50;

async function main() {
  const transport = new StreamableHTTPClientTransport(new URL(TWZRD_MCP_URL));

  const mcpClient: MCPClient = await createMCPClient({ transport });

  try {
    const tools = await mcpClient.tools();

    // Step 1: Score the agent trust using TWZRD tools
    const { text: trustResult } = await generateText({
      model: openai('gpt-4o-mini'),
      tools,
      stopWhen: isStepCount(3),
      onStepFinish: async ({ toolResults }) => {
        console.log(`Tool results: ${JSON.stringify(toolResults, null, 2)}`);
      },
      system: `You are a trust verification agent. You have access to TWZRD Agent Intel tools.
               Use score_agent to check the trust score for a given wallet address.
               If the trust score is >= ${TRUST_THRESHOLD}, output "TRUSTED: <score>".
               If the trust score is < ${TRUST_THRESHOLD}, output "UNTRUSTED: <score>".`,
      prompt: `Check the trust score for this Solana agent wallet: ${AGENT_WALLET}`,
    });

    console.log(`\nTrust verification result: ${trustResult}`);

    // Step 2: Run preflight check before any transaction
    const { text: preflightResult } = await generateText({
      model: openai('gpt-4o-mini'),
      tools,
      stopWhen: isStepCount(3),
      system: 'Use the preflight_check tool to verify if an agent wallet is safe to transact with.',
      prompt: `Run a preflight check on wallet: ${AGENT_WALLET}`,
    });

    console.log(`Preflight check result: ${preflightResult}`);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mcpClient.close();
  }
}

main();
