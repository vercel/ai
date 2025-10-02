/**
 * Reproduction script for the tool-result content part error.
 * 
 * This script demonstrates the issue where assistant messages containing
 * 'reasoning' and 'tool-result' parts (from reasoning models with provider-executed tools)
 * cause JSON schema validation errors when included in follow-up requests.
 * 
 * To reproduce:
 * 1. First request: Use a reasoning model with web_search (provider-executed tool)
 * 2. Second request: Include the previous assistant message in the conversation history
 * 
 * Expected behavior (after fix):
 * - The reasoning and tool-result parts are filtered out when converting to Chat API format
 * - The follow-up request succeeds
 * 
 * Before fix:
 * - JSON schema validation error: "Invalid input" for tool-result content parts
 */

import 'dotenv/config';
import { openai } from '@ai-sdk/openai';
import { generateText, APICallError } from 'ai';

async function main() {
  console.log('===================================');
  console.log('Multi-turn conversation with web_search tool');
  console.log('===================================\n');

  // First request with web_search (provider-executed tool)
  console.log('📤 First request: Using web_search tool...\n');
  
  const firstResult = await generateText({
    model: 'openai/gpt-5-mini',
    prompt: 'What is the capital of France? Search for the answer.',
    providerOptions: {
      openai: { 
        reasoningSummary: 'auto',
        reasoningEffort: 'low' 
      },
    },
    tools: {
      web_search: openai.tools.webSearch(),
    },
  });

  console.log('✅ First response:');
  console.log(firstResult.text);
  console.log('\n---\n');

  // Inspect the messages from the first result
  console.log('📋 Messages from first result:');
  console.log(JSON.stringify(firstResult.response.messages, null, 2));
  console.log('\n---\n');

  // Check if assistant message contains reasoning and tool-result parts
  const assistantMessage = firstResult.response.messages.find(
    m => m.role === 'assistant'
  );
  if (assistantMessage && Array.isArray(assistantMessage.content)) {
    const hasReasoning = assistantMessage.content.some(
      (part: any) => part.type === 'reasoning'
    );
    const hasToolResult = assistantMessage.content.some(
      (part: any) => part.type === 'tool-result'
    );
    
    console.log(`🔍 Assistant message contains:`);
    console.log(`   - reasoning parts: ${hasReasoning}`);
    console.log(`   - tool-result parts: ${hasToolResult}`);
    console.log('\n---\n');
  }

  // Second request - this would fail before the fix
  console.log('📤 Second request: Follow-up question with conversation history...\n');
  
  try {
    const secondResult = await generateText({
      model: 'openai/gpt-5-mini',
      messages: [
        ...firstResult.response.messages,
        { role: 'user', content: 'What language do they speak there?' },
      ],
      providerOptions: {
        openai: { 
          reasoningSummary: 'auto',
          reasoningEffort: 'low' 
        },
      },
    });

    console.log('✅ Second response (SUCCESS - fix is working!):');
    console.log(secondResult.text);
    console.log('\n---\n');
    
    console.log('✅ Test passed! The fix correctly handles reasoning and tool-result parts.');
    
  } catch (error) {
    console.error('❌ Second request failed (this was the bug):');
    console.error(error);
    
    if (APICallError.isInstance(error)) {
      console.error('\n📝 Request body that caused the error:');
      console.error(JSON.stringify(error.requestBodyValues, null, 2));
      
      // Show specific validation errors
      if (error.responseBody) {
        console.error('\n🔍 Response body with validation errors:');
        console.error(JSON.stringify(error.responseBody, null, 2));
      }
    }
    
    console.log('\n💡 This error happens because:');
    console.log('   1. The first assistant message contains "reasoning" and "tool-result" parts');
    console.log('   2. These are specific to the Responses API');
    console.log('   3. The converter needs to filter them out for the Chat API');
    
    throw error;
  }
}

main().catch(error => {
  console.error('\n❌ Script failed');
  process.exit(1);
});

