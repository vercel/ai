import assert from 'node:assert/strict';
import http from 'node:http';
import { OpenAIResponsesLanguageModel } from '../dist/internal/index.js';

const TEST_PROMPT = [
  { role: 'user', content: [{ type: 'text', text: 'Say hello' }] },
];

function truncatedStatusEvent(type, fillCharacter) {
  // Simulates the ChatGPT Codex OAuth responses stream where response.* status
  // events include a very large instructions field and arrive as truncated JSON.
  // The missing closing quote/braces intentionally triggers AI_JSONParseError:
  // "Unterminated string".
  return [
    `event: ${type}`,
    `data: {"type":"${type}","response":{"id":"resp_issue_14473","object":"response","created_at":1741269019,"status":"in_progress","error":null,"incomplete_details":null,"input":[],"instructions":"${fillCharacter.repeat(
      30_000,
    )}`,
    '',
    '',
  ].join('\n');
}

const validStreamingTextEvents = [
  `event: response.output_item.added
data: {"type":"response.output_item.added","output_index":0,"item":{"id":"msg_issue_14473","type":"message","status":"in_progress","role":"assistant","content":[]}}

`,
  `event: response.content_part.added
data: {"type":"response.content_part.added","item_id":"msg_issue_14473","output_index":0,"content_index":0,"part":{"type":"output_text","text":"","annotations":[],"logprobs":[]}}

`,
  `event: response.output_text.delta
data: {"type":"response.output_text.delta","item_id":"msg_issue_14473","output_index":0,"content_index":0,"delta":"Hello"}

`,
  `event: response.output_text.delta
data: {"type":"response.output_text.delta","item_id":"msg_issue_14473","output_index":0,"content_index":0,"delta":" from Codex"}

`,
  `event: response.output_text.done
data: {"type":"response.output_text.done","item_id":"msg_issue_14473","output_index":0,"content_index":0,"text":"Hello from Codex"}

`,
  `event: response.content_part.done
data: {"type":"response.content_part.done","item_id":"msg_issue_14473","output_index":0,"content_index":0,"part":{"type":"output_text","text":"Hello from Codex","annotations":[]}}

`,
  `event: response.output_item.done
data: {"type":"response.output_item.done","output_index":0,"item":{"id":"msg_issue_14473","type":"message","status":"completed","role":"assistant","content":[{"type":"output_text","text":"Hello from Codex","annotations":[]}]}}

`,
];

const sseChunks = [
  truncatedStatusEvent('response.created', 'x'),
  truncatedStatusEvent('response.in_progress', 'y'),
  ...validStreamingTextEvents,
  truncatedStatusEvent('response.completed', 'z'),
  'data: [DONE]\n\n',
];

const server = http.createServer((request, response) => {
  request.resume();
  request.on('end', () => {
    response.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });

    for (const chunk of sseChunks) {
      response.write(chunk);
    }
    response.end();
  });
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

try {
  const { port } = server.address();
  const model = new OpenAIResponsesLanguageModel('gpt-5.3-codex', {
    provider: 'openai.responses',
    url: ({ path }) => `http://127.0.0.1:${port}/v1${path}`,
    headers: () => ({ Authorization: 'Bearer local-reproduction' }),
  });

  const { stream } = await model.doStream({
    prompt: TEST_PROMPT,
    includeRawChunks: false,
  });

  const parts = [];
  for await (const part of stream) {
    parts.push(part);
  }

  const text = parts
    .filter(part => part.type === 'text-delta')
    .map(part => part.delta)
    .join('');
  const errors = parts.filter(part => part.type === 'error');
  const finish = parts.find(part => part.type === 'finish');

  console.log(
    JSON.stringify(
      {
        partTypes: parts.map(part => part.type),
        text,
        errorNames: errors.map(part => part.error?.name),
        errorMessages: errors.map(part => part.error?.message?.slice(0, 120)),
        finishReason: finish?.finishReason,
      },
      null,
      2,
    ),
  );

  assert.equal(text, 'Hello from Codex');
  assert.equal(
    errors.length,
    0,
    'Truncated response.* status events should be skipped, not emitted as stream errors.',
  );
  assert.notEqual(
    finish?.finishReason?.unified,
    'error',
    'Truncated response.* status events should not force finishReason=error.',
  );
} finally {
  await new Promise(resolve => server.close(resolve));
}
