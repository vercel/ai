#!/usr/bin/env tsx
/**
 * Example: Resource Subscriptions with MCP
 *
 * This example demonstrates how to subscribe to resource updates from an MCP server.
 * When a resource changes, the server sends a notification and you can react to it.
 */

import { experimental_createMCPClient } from '../src/tool/mcp/mcp-client.js';

async function main() {
  console.log('🔄 Creating MCP client for resource subscriptions...\n');

  const mcpClient = await experimental_createMCPClient({
    transport: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', process.cwd()],
    },
  });

  try {
    // List available resources
    console.log('📋 Listing resources...');
    const resourcesResult = await mcpClient.listResources();
    console.log(`Found ${resourcesResult.resources.length} resources:\n`);

    resourcesResult.resources.slice(0, 3).forEach(resource => {
      console.log(`  - ${resource.name}`);
      console.log(`    URI: ${resource.uri}`);
      if (resource.description) console.log(`    Description: ${resource.description}`);
      console.log();
    });

    // Set up notification handler
    console.log('📬 Setting up resource update handler...\n');
    mcpClient.onResourceUpdated(async ({ uri }) => {
      console.log(`🔔 Resource updated: ${uri}`);
      console.log('   Fetching updated content...');

      try {
        const result = await mcpClient.readResource(uri);
        console.log(`   Updated content: ${result.contents.length} parts`);

        for (const content of result.contents) {
          if ('text' in content) {
            console.log(`   Text preview: ${content.text.substring(0, 100)}...`);
          } else if ('blob' in content) {
            console.log(`   Binary content: ${content.blob.length} bytes`);
          }
        }
      } catch (error) {
        console.error(`   Error reading resource: ${error}`);
      }
      console.log();
    });

    // Subscribe to a resource
    if (resourcesResult.resources.length > 0) {
      const resourceUri = resourcesResult.resources[0].uri;
      console.log(`🔔 Subscribing to: ${resourceUri}\n`);

      try {
        await mcpClient.subscribeResource(resourceUri);
        console.log('✅ Successfully subscribed!');
        console.log('   The server will send notifications when this resource changes.');
        console.log('   (Modify the file to see updates)\n');

        // Keep the process alive to receive notifications
        console.log('👂 Listening for updates... (Press Ctrl+C to exit)\n');
        await new Promise(() => {}); // Wait forever

      } catch (error) {
        if (error instanceof Error && error.message.includes('does not support resource subscriptions')) {
          console.log('ℹ️  This server does not support resource subscriptions.');
          console.log('   Try using a server that implements the subscribe capability.\n');
        } else {
          throw error;
        }
      }
    } else {
      console.log('⚠️  No resources found to subscribe to.\n');
    }

  } finally {
    await mcpClient.close();
  }
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
