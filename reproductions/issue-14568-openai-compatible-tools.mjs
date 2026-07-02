#!/usr/bin/env node
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { streamText } from '../packages/ai/dist/index.js';
import { createOpenAICompatible } from '../packages/openai-compatible/dist/index.js';

const issueToolSchema = {
  type: 'object',
  properties: { path: { type: 'string' } },
  required: ['path'],
};

function sseTextResponse(text = 'hello') {
  return [
    `data: ${JSON.stringify({
      id: 'chatcmpl-issue-14568',
      object: 'chat.completion.chunk',
      created: 0,
      model: 'claude-sonnet-4.6',
      choices: [
        {
          index: 0,
          delta: { role: 'assistant', content: text },
          finish_reason: null,
        },
      ],
    })}\n\n`,
    `data: ${JSON.stringify({
      id: 'chatcmpl-issue-14568',
      object: 'chat.completion.chunk',
      created: 0,
      model: 'claude-sonnet-4.6',
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    })}\n\n`,
    'data: [DONE]\n\n',
  ].join('');
}

async function captureStreamTextRequest(options) {
  let capturedRequestBody;

  const server = createServer((req, res) => {
    let rawBody = '';

    req.setEncoding('utf8');
    req.on('data', chunk => {
      rawBody += chunk;
    });
    req.on('end', () => {
      capturedRequestBody = JSON.parse(rawBody);
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end(sseTextResponse());
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    const { port } = server.address();
    const provider = createOpenAICompatible({
      name: 'github-copilot',
      baseURL: `http://127.0.0.1:${port}`,
      headers: { Authorization: 'Bearer local-capture-token' },
    });

    const result = streamText({
      model: provider.chatModel('claude-sonnet-4.6'),
      prompt: 'Say hello.',
      ...options,
    });

    assert.equal(await result.text, 'hello');
    assert.ok(capturedRequestBody, 'local capture server did not receive a request');
    return capturedRequestBody;
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

const withoutTools = await captureStreamTextRequest({});
assert.equal(
  withoutTools.tools,
  undefined,
  'baseline no-tools request should not include tools',
);

const withIssueToolShape = await captureStreamTextRequest({
  tools: {
    read_file: {
      description: 'Read a file',
      parameters: issueToolSchema,
    },
  },
});

const forwardedParameters =
  withIssueToolShape.tools?.[0]?.function?.parameters;

console.log(
  'Captured function.parameters for the issue repro tool shape:',
  JSON.stringify(forwardedParameters, null, 2),
);

assert.deepEqual(
  forwardedParameters,
  issueToolSchema,
  [
    'Issue #14568 reproduced: the JSON schema supplied as tool.parameters is',
    'not forwarded to the OpenAI-compatible chat/completions request.',
    'GitHub Copilot rejects or mishandles this malformed tool schema.',
  ].join(' '),
);
