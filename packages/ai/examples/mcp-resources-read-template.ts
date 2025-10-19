/**
 * Example demonstrating reading from an MCP Resource Template
 *
 * Run with: npx tsx packages/ai/examples/mcp-resources-read-template.ts
 */

import { createMCPClient } from '../src/tool/mcp/mcp-client.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function main() {
  console.log('🚀 Testing MCP Resource Template Reading\n');

  const mcpClient = await createMCPClient({
    transport: new StdioClientTransport({
      command: 'npx',
      args: ['-y', 'nostr-explore-mcp@latest'],
    }),
  });

  try {
    // Get resource templates
    const templatesResult = await mcpClient.listResourceTemplates();
    console.log(`Found ${templatesResult.resourceTemplates.length} resource templates\n`);

    if (templatesResult.resourceTemplates.length === 0) {
      console.log('❌ No resource templates found');
      return;
    }

    // Test reading from the nostr-feed template
    const template = templatesResult.resourceTemplates[0];
    console.log(`📖 Testing template: ${template.name}`);
    console.log(`   URI Template: ${template.uriTemplate}\n`);

    // Use a sample Nostr pubkey in hex format
    // Using jack's pubkey for testing
    const samplePubkey = '82341f882b6eabcd2ba7f1ef90aad961cf074af15b9ef44a09f9d2a8fbfbe6a2'; // jack
    const sampleKinds = '1'; // just notes

    // Construct the URI from the template
    const uri = template.uriTemplate
      .replace('{pubkey}', samplePubkey)
      .replace('{kinds}', sampleKinds);

    console.log(`📡 Reading resource from URI: ${uri}`);
    console.log('   (This will fetch recent Nostr events...)\n');

    try {
      const result = await mcpClient.readResource(uri);

      console.log(`✅ Successfully read resource!`);
      console.log(`   Received ${result.contents.length} content block(s)\n`);

      for (const content of result.contents) {
        if ('text' in content) {
          console.log(`   📄 Text content (${content.text.length} chars):`);
          console.log(`      MIME Type: ${content.mimeType}`);

          // Parse NDJSON (newline-delimited JSON)
          const lines = content.text.trim().split('\n');
          console.log(`      Lines: ${lines.length}`);

          // Show first few events
          const samplesToShow = Math.min(3, lines.length);
          console.log(`\n      First ${samplesToShow} events:\n`);

          for (let i = 0; i < samplesToShow; i++) {
            try {
              const event = JSON.parse(lines[i]);
              console.log(`      Event ${i + 1}:`);
              console.log(`        ID: ${event.id?.substring(0, 16)}...`);
              console.log(`        Kind: ${event.kind}`);
              console.log(`        Created: ${new Date(event.created_at * 1000).toISOString()}`);
              console.log(`        Content: ${event.content?.substring(0, 80)}${event.content?.length > 80 ? '...' : ''}`);
              console.log();
            } catch (e) {
              console.log(`        (Failed to parse line ${i + 1})`);
            }
          }
        } else if ('blob' in content) {
          console.log(`   💾 Binary content: ${content.blob.length} bytes (base64)`);
        }
      }

      // Now test using it as a tool
      console.log('\n🔨 Testing resource template as a tool...\n');

      const tools = await mcpClient.tools({ includeResources: true });
      const resourceTool = tools['resource_template_nostr-feed'];

      if (resourceTool) {
        console.log('✅ Resource template tool found!');
        console.log(`   Tool name: resource_template_nostr-feed`);
        console.log(`   Description: ${resourceTool.description}`);
        console.log(`   Input schema: ${JSON.stringify(resourceTool.inputSchema, null, 2)}`);

        console.log('\n   Calling tool with parameters...');
        const toolResult = await resourceTool.execute(
          { pubkey: samplePubkey, kinds: sampleKinds },
          { messages: [], toolCallId: 'test-1' }
        );

        console.log(`   ✅ Tool executed successfully!`);
        console.log(`   Result type: ${typeof toolResult}`);
        console.log(`   Has contents: ${'contents' in toolResult}`);
      }

    } catch (error: any) {
      console.error('❌ Error reading resource:', error.message);
    }

    console.log('\n✅ All tests completed!');

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await mcpClient.close();
    console.log('\n🔒 MCP client closed');
  }
}

main().catch(console.error);
