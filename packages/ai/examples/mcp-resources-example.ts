/**
 * Example demonstrating MCP Resources support with nostr-explore-mcp
 *
 * Run with: npx tsx packages/ai/examples/mcp-resources-example.ts
 */

import { createMCPClient } from '../src/tool/mcp/mcp-client.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function main() {
  console.log('🚀 Testing MCP Resources with nostr-explore-mcp\n');

  // Create MCP client connected to nostr-explore-mcp
  const mcpClient = await createMCPClient({
    transport: new StdioClientTransport({
      command: 'npx',
      args: ['-y', 'nostr-explore-mcp@latest'],
    }),
  });

  try {
    // Test 1: List Resources
    console.log('📋 Listing resources...');
    const resourcesResult = await mcpClient.listResources();
    console.log(`Found ${resourcesResult.resources.length} resources:\n`);

    for (const resource of resourcesResult.resources) {
      console.log(`  📄 ${resource.name}`);
      console.log(`     URI: ${resource.uri}`);
      console.log(`     Description: ${resource.description || 'N/A'}`);
      console.log(`     MIME Type: ${resource.mimeType || 'N/A'}\n`);
    }

    // Test 2: List Resource Templates
    console.log('🔧 Listing resource templates...');
    const templatesResult = await mcpClient.listResourceTemplates();
    console.log(`Found ${templatesResult.resourceTemplates.length} resource templates:\n`);

    for (const template of templatesResult.resourceTemplates) {
      console.log(`  🔗 ${template.name}`);
      console.log(`     URI Template: ${template.uriTemplate}`);
      console.log(`     Description: ${template.description || 'N/A'}`);
      console.log(`     MIME Type: ${template.mimeType || 'N/A'}\n`);
    }

    // Test 3: Read a specific resource
    if (resourcesResult.resources.length > 0) {
      const firstResource = resourcesResult.resources[0];
      console.log(`📖 Reading resource: ${firstResource.name}`);

      const content = await mcpClient.readResource(firstResource.uri);
      console.log(`   Received ${content.contents.length} content block(s):\n`);

      for (const block of content.contents) {
        if ('text' in block) {
          console.log(`   Text content (${block.text.length} chars):`);
          console.log(`   ${block.text.substring(0, 200)}${block.text.length > 200 ? '...' : ''}\n`);
        } else if ('blob' in block) {
          console.log(`   Binary content: ${block.blob.length} bytes (base64)\n`);
        }
      }
    }

    // Test 4: Get tools with resources included
    console.log('🔨 Getting tools with resources included...');
    const tools = await mcpClient.tools({ includeResources: true });

    const toolNames = Object.keys(tools);
    const resourceToolNames = toolNames.filter(name =>
      name.startsWith('resource_') || name.startsWith('resource_template_')
    );

    console.log(`   Total tools: ${toolNames.length}`);
    console.log(`   Resource tools: ${resourceToolNames.length}`);
    console.log(`   Regular tools: ${toolNames.length - resourceToolNames.length}\n`);

    if (resourceToolNames.length > 0) {
      console.log('   Resource tools available:');
      for (const name of resourceToolNames) {
        console.log(`     - ${name}`);
      }
      console.log();
    }

    // Test 5: Try using a resource template if available
    if (templatesResult.resourceTemplates.length > 0) {
      const template = templatesResult.resourceTemplates[0];
      console.log(`🎯 Testing resource template: ${template.name}`);
      console.log(`   URI Template: ${template.uriTemplate}\n`);

      // Try to read a resource from the template with a sample value
      // (This will depend on the actual template structure)
      console.log('   Note: Template parameter substitution would be tested here\n');
    }

    console.log('✅ All tests completed successfully!');

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await mcpClient.close();
    console.log('\n🔒 MCP client closed');
  }
}

main().catch(console.error);
