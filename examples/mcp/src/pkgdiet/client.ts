import { openai } from "@ai-sdk/openai";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { generateText, isStepCount } from "ai";
import { createMCPClient } from "@ai-sdk/mcp";
import "dotenv/config";

/**
 * Example demonstrating how an AI SDK agent uses the PkgDiet MCP server
 * as a local dependency guardrail before recommending or installing npm packages.
 */
async function main() {
  let mcpClient;

  try {
    // Connect to the PkgDiet MCP server over stdio
    const stdioTransport = new StdioClientTransport({
      command: "npx",
      args: ["-y", "pkgdiet@2.0.1", "mcp"],
    });

    mcpClient = await createMCPClient({
      transport: stdioTransport,
    });

    // Query available PkgDiet tools (check_dependency, suggest_alternative, explain_verdict)
    const tools = await mcpClient.tools();

    const { text: answer } = await generateText({
      model: openai("gpt-4o"),
      tools,
      stopWhen: isStepCount(5),
      instructions:
        "You are an expert AI software engineer. Before recommending or installing any npm package, " +
        "you MUST evaluate it using the check_dependency tool. If the verdict is BLOCK or WARN, " +
        "explain the security/bloat risks and suggest modern alternatives.",
      prompt:
        'I am building a Node.js API client and need an HTTP library. Should I install the "request" package?',
    });

    console.log(`\nAgent Response:\n${answer}\n`);
  } finally {
    await mcpClient?.close();
  }
}

main().catch(console.error);
