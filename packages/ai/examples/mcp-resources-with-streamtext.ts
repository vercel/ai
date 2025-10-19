/**
 * Example demonstrating how to use MCP Resources with streamText
 *
 * Run with: npx tsx packages/ai/examples/mcp-resources-with-streamtext.ts
 */

import { createMCPClient } from '../src/tool/mcp/mcp-client.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { streamText } from '../src/generate-text/stream-text.js';
import { openai } from '@ai-sdk/openai';

async function main() {
  console.log('🚀 Using MCP Resources with streamText\n');

  // Create MCP client
  const mcpClient = await createMCPClient({
    transport: new StdioClientTransport({
      command: 'npx',
      args: ['-y', 'nostr-explore-mcp@latest'],
    }),
  });

  try {
    // Get tools with resources included
    // Resources will be exposed as callable tools:
    // - Direct resources: resource_{name}
    // - Resource templates: resource_template_{name}
    const tools = await mcpClient.tools({ includeResources: true });

    console.log('📦 Available tools:');
    for (const [name, tool] of Object.entries(tools)) {
      if (name.startsWith('resource_')) {
        console.log(`  🔖 ${name} (resource tool)`);
      } else {
        console.log(`  🔧 ${name} (regular tool)`);
      }
    }
    console.log();

    // Now use with streamText - the AI can call resource tools automatically
    console.log('💬 Streaming AI response with access to resources...\n');

    const result = streamText({
      model: openai('gpt-4o'),
      tools, // Pass all tools including resources
      maxSteps: 5, // Allow multiple tool calls
      prompt: `
        Using the nostr-feed resource, fetch recent notes from jack (pubkey: 82341f882b6eabcd2ba7f1ef90aad961cf074af15b9ef44a09f9d2a8fbfbe6a2).
        Show me the 3 most recent posts and summarize what he's talking about.
      `,
      onStepFinish: (event) => {
        if (event.toolCalls && event.toolCalls.length > 0) {
          console.log('\n🔨 Tool calls in this step:');
          for (const toolCall of event.toolCalls) {
            console.log(`  - ${toolCall.toolName}`);
            console.log(`    Args: ${JSON.stringify(toolCall.args, null, 2)}`);
          }
        }

        if (event.toolResults && event.toolResults.length > 0) {
          console.log('\n📦 Tool results:');
          for (const toolResult of event.toolResults) {
            console.log(`  - ${toolResult.toolName}`);
            if ('contents' in toolResult.result) {
              const contents = toolResult.result.contents;
              console.log(`    Received ${contents.length} content block(s)`);
              for (const content of contents) {
                if ('text' in content) {
                  console.log(`    Text: ${content.text.length} chars`);
                }
              }
            }
          }
        }
      },
    });

    // Stream the text response
    console.log('\n🤖 AI Response:\n');
    for await (const chunk of result.textStream) {
      process.stdout.write(chunk);
    }
    console.log('\n');

    // Wait for completion
    const completion = await result.response;
    console.log('\n📊 Usage:');
    console.log(`  Prompt tokens: ${completion.usage.promptTokens}`);
    console.log(`  Completion tokens: ${completion.usage.completionTokens}`);
    console.log(`  Total tokens: ${completion.usage.totalTokens}`);

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await mcpClient.close();
    console.log('\n🔒 MCP client closed');
  }
}

main().catch(console.error);
