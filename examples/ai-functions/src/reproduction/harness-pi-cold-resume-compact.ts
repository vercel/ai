import {
  HarnessAgent,
  type HarnessAgentResumeSessionState,
} from '@ai-sdk/harness/agent';
import { createPi } from '@ai-sdk/harness-pi';
import { createJustBashSandbox } from '@ai-sdk/sandbox-just-bash';
import { createServer } from 'node:http';

const FAILURE_SIGNAL =
  'REPRODUCTION FAILURE: cold resumed session compact() resolved without sending a summarization request';

async function main() {
  const requests: unknown[] = [];
  const server = createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/v1/responses') {
      response.writeHead(404).end();
      return;
    }

    let body = '';
    for await (const chunk of request) {
      body += chunk;
    }
    const parsedBody: unknown = JSON.parse(body);
    requests.push(parsedBody);

    const requestNumber = requests.length;
    const isSummarization = JSON.stringify(parsedBody).includes(
      'context summarization assistant',
    );
    const outputText = isSummarization
      ? '## Goal\nPreserve the restored conversation.\n\n## Next Steps\n1. Continue.'
      : `Acknowledged. ${'context '.repeat(15_000)}`;
    const item = {
      id: `msg_${requestNumber}`,
      type: 'message',
      status: 'completed',
      role: 'assistant',
      content: [
        {
          type: 'output_text',
          text: outputText,
          annotations: [],
        },
      ],
    };
    const completedResponse = {
      id: `resp_${requestNumber}`,
      object: 'response',
      created_at: 0,
      status: 'completed',
      model: 'gpt-4o-mini',
      output: [item],
      usage: {
        input_tokens: 25_000,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: 5_000,
        output_tokens_details: { reasoning_tokens: 0 },
        total_tokens: 30_000,
      },
    };
    const events = [
      {
        type: 'response.created',
        response: { ...completedResponse, status: 'in_progress', output: [] },
      },
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: { ...item, status: 'in_progress', content: [] },
      },
      {
        type: 'response.content_part.added',
        item_id: item.id,
        output_index: 0,
        content_index: 0,
        part: { type: 'output_text', text: '', annotations: [] },
      },
      {
        type: 'response.output_text.delta',
        item_id: item.id,
        output_index: 0,
        content_index: 0,
        delta: outputText,
      },
      {
        type: 'response.output_item.done',
        output_index: 0,
        item,
      },
      {
        type: 'response.completed',
        response: completedResponse,
      },
    ];

    response.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    for (const event of events) {
      response.write(
        `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
      );
    }
    response.end('data: [DONE]\n\n');
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (address == null || typeof address === 'string') {
    throw new Error('Loopback endpoint did not expose a TCP port.');
  }

  const harness = createPi({
    auth: {
      OPENAI_API_KEY: 'loopback-test-key',
      OPENAI_BASE_URL: `http://127.0.0.1:${address.port}/v1`,
    },
  });
  const createAgent = () =>
    new HarnessAgent({
      harness,
      model: 'openai/gpt-4o-mini',
    });
  const countSummarizationRequests = () =>
    requests.filter(request =>
      JSON.stringify(request).includes('context summarization assistant'),
    ).length;

  const warmSandbox = await createJustBashSandbox({
    cwd: '/sandbox',
  }).createSession();
  const coldSandbox = await createJustBashSandbox({
    cwd: '/sandbox',
  }).createSession();

  let failure: Error | undefined;
  try {
    // Control: the same journal is compactable while its native Pi session is
    // initialized. This also validates the loopback endpoint and response.
    const warmSession = await createAgent().createSession({
      sandboxSession: warmSandbox,
    });
    try {
      await createAgent().generate({
        session: warmSession,
        prompt: 'Remember that the project codename is cold-resume.',
      });
      const beforeWarmCompact = countSummarizationRequests();
      await warmSession.compact();
      if (countSummarizationRequests() !== beforeWarmCompact + 1) {
        throw new Error(
          'Control failure: a warm Pi session did not send a summarization request.',
        );
      }
    } finally {
      await warmSession.destroy();
    }

    // Reported sequence: normal turn, detach + serialize, create a fresh local
    // handle over the same sandbox, then compact before another prompt.
    const firstAgent = createAgent();
    const firstSession = await firstAgent.createSession({
      sandboxSession: coldSandbox,
    });
    const sessionId = firstSession.sessionId;
    await firstAgent.generate({
      session: firstSession,
      prompt: 'Remember that the project codename is cold-resume.',
    });
    const detachedState = await firstSession.detach();
    const resumeState = JSON.parse(
      JSON.stringify(detachedState),
    ) as HarnessAgentResumeSessionState;

    const resumedSession = await createAgent().createSession({
      sessionId,
      resumeFrom: resumeState,
      sandboxSession: coldSandbox,
    });
    try {
      if (!resumedSession.isResume) {
        throw new Error('Expected the replacement handle to be resumed.');
      }
      const beforeColdCompact = countSummarizationRequests();
      await resumedSession.compact();
      if (countSummarizationRequests() !== beforeColdCompact + 1) {
        failure = new Error(FAILURE_SIGNAL);
      }
    } finally {
      await resumedSession.destroy();
    }
  } finally {
    await Promise.allSettled([warmSandbox.destroy(), coldSandbox.destroy()]);
    await new Promise<void>(resolve => server.close(() => resolve()));
  }

  if (failure) {
    throw failure;
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
