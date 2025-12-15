import { createUIMessageStreamResponse, UIMessage } from 'ai';
import { NextResponse } from 'next/server';

import { createAgent } from 'langchain';
import { ChatOpenAI, tools } from '@langchain/openai';
import { toBaseMessages, toUIMessageStream } from '@ai-sdk/langchain';

/**
 * Allow streaming responses up to 60 seconds for image generation
 */
export const maxDuration = 60;

/**
 * The model to use for the agent (must support image generation)
 */
const model = new ChatOpenAI({
  model: 'gpt-4o',
  temperature: 0.7,
});

/**
 * Image generation tool configuration
 * Supports various sizes, quality levels, and output formats
 */
const imageGenerationTool = tools.imageGeneration({
  size: '1024x1024',
  quality: 'high',
  outputFormat: 'png',
});

/**
 * The LangChain agent with image generation capabilities
 */
const agent = createAgent({
  model,
  tools: [imageGenerationTool],
  systemPrompt: `You are a creative AI artist assistant that can generate images from text descriptions.

When a user asks you to draw, create, generate, or design an image:
1. Use the image generation tool to create the image
2. Describe what you created after generating it
3. Be creative and add artistic details to make the image interesting

Tips for best results:
- Use detailed, descriptive prompts
- Include artistic style, lighting, and mood details
- For edits, describe what changes to make clearly

You can generate various types of images including:
- Artwork and illustrations
- Photographs and realistic scenes
- Logos and designs
- Fantasy and sci-fi imagery
- Portraits and characters`,
});

/**
 * The API route for the LangChain agent with image generation
 * @param req - The request object
 * @returns The response from the API
 */
export async function POST(req: Request) {
  try {
    const { messages }: { messages: UIMessage[] } = await req.json();

    /**
     * Convert AI SDK UIMessages to LangChain messages
     */
    const langchainMessages = await toBaseMessages(messages);

    /**
     * Stream from the LangChain agent with image generation support
     * Note: Type assertion needed due to LangChain type version mismatch
     */
    const stream = await agent.stream(
      { messages: langchainMessages },
      { streamMode: ['values', 'messages'] },
    );

    /**
     * Convert the LangChain stream to UI message stream
     * Image generation results will be included in the tool outputs
     */
    return createUIMessageStreamResponse({
      stream: toUIMessageStream(stream as unknown as ReadableStream),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
