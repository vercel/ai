#!/usr/bin/env node

const url = process.env.SCIRA_BENCH_URL ?? 'http://localhost:3000/api/search';
const chatId = `memory-benchmark-${Date.now()}`;
const messageId = `message-${Date.now()}`;

const response = await fetch(url, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    messages: [
      {
        id: messageId,
        role: 'user',
        parts: [
          {
            type: 'text',
            text: 'Explain why process-tree RSS differs from JavaScript heap usage in five concise points.',
          },
        ],
      },
    ],
    model: 'scira-default',
    group: 'chat',
    timezone: 'UTC',
    id: chatId,
    selectedVisibilityType: 'private',
    isCustomInstructionsEnabled: false,
    selectedConnectors: [],
    isTemporaryChat: true,
    isAutoRouted: false,
    autoRouterEnabled: false,
  }),
});

if (!response.ok) {
  throw new Error(
    `Scira request failed (${response.status}): ${await response.text()}`,
  );
}

if (!response.body) {
  throw new Error('Scira response did not contain a stream');
}

const reader = response.body.getReader();
let bytes = 0;
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  bytes += value.byteLength;
}

console.log(`Consumed ${bytes} response bytes from Scira`);
