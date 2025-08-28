import { google } from '@ai-sdk/google';
import { generateText, stepCountIs, tool } from 'ai';
import { z } from 'zod/v4';
import 'dotenv/config';
import { anthropic } from '@ai-sdk/anthropic';

// Helper function to convert URL to base64
async function urlToBase64(url: string): Promise<string> {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  return Buffer.from(bytes).toString('base64');
}

// Tool that fetches an image and returns it for the model to analyze
const imageAnalysisTool = tool({
  description: 'Give the image ',
  inputSchema: z.object({}),
  execute: async ({}) => {
    try {
      const base64Image = await urlToBase64(
        'https://images.unsplash.com/photo-1751225750479-43ad27b94fa0?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxmZWF0dXJlZC1waG90b3MtZmVlZHwyfHx8ZW58MHx8fHx8fHx8',
      );

      return {
        success: true,
        description: 'Image fetched successfully',
        base64Image,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to fetch image: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
  // This is the key part - toModelOutput now works correctly with Google models
  toModelOutput(output: { base64Image?: string }) {
    return {
      type: 'content',
      value: [
        {
          type: 'media',
          mediaType: 'image/jpeg',
          data: output.base64Image!,
        },
      ],
    };
  },
});

async function main() {
  console.log(
    '🔍 Testing Google model image analysis with tool-returned images...\n',
  );

  const result = await generateText({
    model: google('gemini-2.5-flash'),
    tools: {
      analyzeImage: imageAnalysisTool,
    },
    stopWhen: stepCountIs(2),
    prompt: `Whats in this image use the tool analyzeImage`,
  });

  console.log('📋 Analysis Result: \n');
  console.log('='.repeat(60));
  console.log(`${JSON.stringify(result.text, null, 2)}\n`);
  // console.log(JSON.stringify(result.steps, null, 2));

  if (result.toolCalls && result.toolCalls.length > 0) {
    console.log('🔧 Tool Calls Made: \n');
    result.toolCalls.forEach((call, index) => {
      console.log(`${index + 1}. ${call.toolName}:`);
      console.log(`   Input: ${JSON.stringify(call.input, null, 2)}`);
    });
    console.log();
  }

  console.log('📊 Usage: \n');
  console.log(`Input tokens: ${result.usage.inputTokens}`);
  console.log(`Output tokens: ${result.usage.outputTokens}`);
  console.log(`Total tokens: ${result.usage.totalTokens}`);
}

main().catch(console.error);
