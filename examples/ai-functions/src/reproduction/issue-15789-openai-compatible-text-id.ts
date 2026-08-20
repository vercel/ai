import fs from 'node:fs/promises';
import path from 'node:path';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { isStepCount, streamText, tool } from 'ai';
import { z } from 'zod';

type UiPart =
  | { type: 'text'; textId: string; text: string }
  | { type: 'tool'; toolCallId: string; toolName: string };

async function loadFixture(filename: string) {
  const fixturePath = path.resolve(
    process.cwd(),
    '../../packages/openai-compatible/src/chat/__fixtures__',
    filename,
  );
  const chunks = (await fs.readFile(fixturePath, 'utf8'))
    .trim()
    .split('\n')
    .map(line => `data: ${line}\n\n`);

  return `${chunks.join('')}data: [DONE]\n\n`;
}

async function main() {
  const responses = await Promise.all([
    loadFixture('issue-15789-step-1.chunks.txt'),
    loadFixture('issue-15789-step-2.chunks.txt'),
  ]);
  let responseIndex = 0;

  const provider = createOpenAICompatible({
    name: 'issue-15789',
    baseURL: 'https://recorded.openai.example/v1',
    apiKey: 'recorded-fixture',
    fetch: async () => {
      const body = responses[responseIndex++];
      if (body == null) {
        throw new Error('Reproduction harness received an unexpected request');
      }
      return new Response(body, {
        headers: { 'content-type': 'text/event-stream' },
      });
    },
  });

  const result = streamText({
    model: provider.chatModel('gpt-4o-2024-08-06'),
    prompt: 'Replays a recorded TEXT -> TOOL -> TEXT provider session.',
    tools: {
      weather: tool({
        inputSchema: z.object({}),
        execute: async () => ({ temperature: 72 }),
      }),
    },
    stopWhen: isStepCount(2),
  });

  const uiParts: UiPart[] = [];
  const textPartIndexes = new Map<string, number>();
  const streamedTextIds: string[] = [];

  for await (const part of result.fullStream) {
    if (part.type === 'text-start') {
      streamedTextIds.push(part.id);
      if (!textPartIndexes.has(part.id)) {
        textPartIndexes.set(part.id, uiParts.length);
        uiParts.push({ type: 'text', textId: part.id, text: '' });
      }
    } else if (part.type === 'text-delta') {
      const index = textPartIndexes.get(part.id);
      const uiPart = index == null ? undefined : uiParts[index];
      if (uiPart?.type !== 'text') {
        throw new Error(`Reproduction harness lost text part ${part.id}`);
      }
      uiPart.text += part.text;
    } else if (part.type === 'tool-call') {
      uiParts.push({
        type: 'tool',
        toolCallId: part.toolCallId,
        toolName: part.toolName,
      });
    }
  }

  const expectedOrder = ['text:PRE_TOOL', 'tool:weather', 'text:POST_TOOL'];
  const actualOrder = uiParts.map(part =>
    part.type === 'text' ? `text:${part.text}` : `tool:${part.toolName}`,
  );

  console.log(`streamed text IDs: ${JSON.stringify(streamedTextIds)}`);
  console.log(`expected UI order: ${JSON.stringify(expectedOrder)}`);
  console.log(`actual UI order: ${JSON.stringify(actualOrder)}`);

  if (JSON.stringify(actualOrder) !== JSON.stringify(expectedOrder)) {
    throw new Error(
      'ISSUE_REPRODUCED: duplicate txt-0 merged the post-tool text into the pre-tool text part, moving the tool card after the combined text',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
