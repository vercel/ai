import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { createXai } from '@ai-sdk/xai';
import { streamText } from 'ai';

const webSearchCall = {
  type: 'web_search_call',
  id: 'ws_issue_13218',
  name: 'web_search',
  arguments: '{"query":"issue 13218"}',
  call_id: '',
  status: 'completed',
};

const chunks = [
  {
    type: 'response.created',
    response: {
      id: 'resp_issue_13218',
      object: 'response',
      model: 'grok-4-fast-non-reasoning',
      output: [],
      status: 'in_progress',
    },
  },
  {
    type: 'response.output_item.added',
    item: webSearchCall,
    output_index: 0,
  },
  {
    type: 'response.output_item.done',
    item: webSearchCall,
    output_index: 0,
  },
  {
    type: 'response.done',
    response: {
      id: 'resp_issue_13218',
      object: 'response',
      model: 'grok-4-fast-non-reasoning',
      output: [],
      status: 'completed',
      usage: {
        input_tokens: 1,
        output_tokens: 1,
      },
    },
  },
];

async function readRequestBody(request: IncomingMessage): Promise<void> {
  for await (const _ of request) {
    // Drain the request body so the local server behaves like the xAI API.
  }
}

async function writeSseResponse(response: ServerResponse): Promise<void> {
  response.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });

  for (const chunk of chunks) {
    response.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }

  response.write('data: [DONE]\n\n');
  response.end();
}

async function main() {
  const server = createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/responses') {
      response.writeHead(404).end();
      return;
    }

    await readRequestBody(request);
    await writeSseResponse(response);
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  try {
    const address = server.address();
    if (address == null || typeof address === 'string') {
      throw new Error('Could not determine local server address.');
    }

    const localXai = createXai({
      baseURL: `http://127.0.0.1:${address.port}`,
      apiKey: 'test-key',
    });

    const result = streamText({
      model: localXai.responses('grok-4-fast-non-reasoning'),
      tools: {
        web_search: localXai.tools.webSearch(),
      },
      prompt: 'Use web search.',
    });

    const parts: Array<{ type: string; [key: string]: unknown }> = [];

    for await (const part of result.stream) {
      if (part.type === 'tool-call' || part.type === 'tool-result') {
        parts.push(part);
      }
    }

    console.log(JSON.stringify(parts, null, 2));

    const toolCall = parts.find(part => part.type === 'tool-call');
    const toolResult = parts.find(part => part.type === 'tool-result');

    if (toolCall != null && toolResult == null) {
      throw new Error(
        'Reproduced issue #13218: xAI web_search_call emitted a provider-executed tool-call, but response.output_item.done did not produce a matching tool-result.',
      );
    }

    if (toolCall == null) {
      throw new Error('Reproduction setup failed: no web_search tool-call was emitted.');
    }

    console.log('Expected tool-result was emitted; issue not reproduced.');
  } finally {
    server.close();
    await once(server, 'close');
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
