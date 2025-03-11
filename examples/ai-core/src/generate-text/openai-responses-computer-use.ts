import { openai } from '@ai-sdk/openai';
import { Sandbox } from '@e2b/desktop';
import { generateText } from 'ai';
import 'dotenv/config';
import fs from 'node:fs';

async function main() {
  const desktop = await Sandbox.create({
    resolution: [1200, 800],
    timeoutMs: 1000 * 60 * 1, // 1 minute
  });

  try {
    await desktop.stream.start();

    console.log(desktop.stream.getUrl());

    const result = await generateText({
      model: openai.responses('computer-use-preview-2025-02-04'),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe the current screen content.' },
          ],
        },
      ],
      tools: {
        computer_use_preview: openai.tools.computerUsePreview({
          displayWidth: 1200,
          displayHeight: 800,
          environment: 'linux',
        }),
      },
    });

    // console.log(result.text);
    // console.log();
    // console.log('Finish reason:', result.finishReason);
    // console.log('Usage:', result.usage);

    console.log('Request:', JSON.stringify(result.request, null, 2));
    console.log('Response:', JSON.stringify(result.response, null, 2));
  } finally {
    await desktop.stream.stop();
  }
}

main().catch(console.error);
