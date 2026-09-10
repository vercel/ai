import { once } from 'node:events';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createPi } from '@ai-sdk/harness-pi';
import { createJustBashSandbox } from '@ai-sdk/sandbox-just-bash';
import { isStepCount } from 'ai';
import {
  createHarnessWorkflowState,
  runHarnessAgentStep,
  type HarnessWorkflowAgent,
  type HarnessWorkflowChunk,
  type HarnessWorkflowState,
} from '../../../../packages/workflow-harness/dist/index.js';

const RECEIPT = 'receipt-20617';
const PROVIDER_ERROR = 'Fixture provider rejection';
const FAILURE_SIGNAL =
  'ISSUE_20617_REPRODUCED: provider error was masked by empty ready_for_next_step continuations';

type RecordedRequest = {
  readonly url: string;
  readonly body: unknown;
};

function collectingWritable(): {
  readonly writable: WritableStream<HarnessWorkflowChunk>;
  readonly chunks: HarnessWorkflowChunk[];
} {
  const chunks: HarnessWorkflowChunk[] = [];
  return {
    chunks,
    writable: new WritableStream<HarnessWorkflowChunk>({
      write(chunk) {
        chunks.push(chunk);
      },
    }),
  };
}

function sendCompletion(response: ServerResponse, text: string): void {
  response.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
  const item = {
    id: 'msg_issue_20617',
    type: 'message',
    status: 'completed',
    role: 'assistant',
    content: [
      {
        type: 'output_text',
        text,
        annotations: [],
        logprobs: [],
      },
    ],
  };
  const completedResponse = {
    id: 'resp_issue_20617',
    object: 'response',
    created_at: 1,
    status: 'completed',
    model: 'gpt-4o',
    output: [item],
    usage: {
      input_tokens: 10,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 2,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 12,
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
      type: 'response.output_text.delta',
      item_id: item.id,
      output_index: 0,
      content_index: 0,
      delta: text,
    },
    {
      type: 'response.output_item.done',
      output_index: 0,
      item,
    },
    { type: 'response.completed', response: completedResponse },
  ];
  for (const event of events) {
    response.write(`event: ${event.type}\n`);
    response.write(`data: ${JSON.stringify(event)}\n\n`);
  }
  response.end();
}

async function startFixtureProvider(): Promise<{
  readonly server: Server;
  readonly baseURL: string;
  readonly requests: RecordedRequest[];
}> {
  const requests: RecordedRequest[] = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(Buffer.from(chunk));
    }
    const bodyText = Buffer.concat(chunks).toString('utf8');
    const body = bodyText.length === 0 ? undefined : JSON.parse(bodyText);
    requests.push({ url: request.url ?? '', body });

    if (requests.length === 1) {
      sendCompletion(response, RECEIPT);
      return;
    }

    if (requests.length <= 4) {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          error: {
            message: PROVIDER_ERROR,
            type: 'invalid_request_error',
          },
        }),
      );
      return;
    }

    sendCompletion(response, `healthy-after-error ${RECEIPT}`);
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address == null || typeof address === 'string') {
    throw new Error('Fixture provider did not bind a TCP port');
  }

  return {
    server,
    baseURL: `http://127.0.0.1:${address.port}/v1`,
    requests,
  };
}

function serialize<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function runStep(
  agent: HarnessWorkflowAgent,
  state: HarnessWorkflowState,
): Promise<{
  readonly state: HarnessWorkflowState;
  readonly chunks: HarnessWorkflowChunk[];
}> {
  const { writable, chunks } = collectingWritable();
  const next = await runHarnessAgentStep({
    agent,
    state: serialize(state),
    writable,
  });
  return { state: serialize(next), chunks };
}

function textFromChunks(chunks: HarnessWorkflowChunk[]): string {
  return chunks
    .filter(
      (
        chunk,
      ): chunk is HarnessWorkflowChunk & {
        type: 'text-delta';
        delta: string;
      } => chunk.type === 'text-delta' && typeof chunk.delta === 'string',
    )
    .map(chunk => chunk.delta)
    .join('');
}

async function main(): Promise<void> {
  const fixture = await startFixtureProvider();
  const sandboxProvider = createJustBashSandbox();
  const sandboxSession = await sandboxProvider.createSession();
  try {
    const harness = createPi({
      auth: {
        OPENAI_API_KEY: 'fixture-key',
        OPENAI_BASE_URL: fixture.baseURL,
      },
    });
    const sessionId = 'issue-20617';
    const warmupAgent = new HarnessAgent({
      harness,
      sandbox: sandboxProvider,
      model: 'openai/gpt-4o',
    });
    const warmupSession = await warmupAgent.createSession({
      sessionId,
      sandboxSession,
    });
    const warmupResult = await warmupAgent.generate({
      session: warmupSession,
      prompt: 'Return the unique receipt.',
    });
    if (!warmupResult.text.includes(RECEIPT)) {
      throw new Error('Precondition failed: successful turn lost its receipt');
    }
    const resumeFrom = serialize(await warmupSession.detach());

    const agent = new HarnessAgent({
      harness,
      sandbox: sandboxProvider,
      model: 'openai/gpt-4o',
      stopWhen: isStepCount(1),
    });
    const workflowAgent: HarnessWorkflowAgent = {
      createSession: options =>
        agent.createSession({ ...options, sandboxSession }),
      stream: options => agent.stream(options),
      continueStream: options => agent.continueStream(options),
    };

    let failingState = createHarnessWorkflowState({
      sessionId,
      prompt: 'Trigger the fixture provider rejection.',
      resumeFrom,
    });
    const failingSteps: Array<{
      readonly status: HarnessWorkflowState['status'];
      readonly text: string;
      readonly chunkTypes: string[];
    }> = [];

    for (let index = 0; index < 3; index += 1) {
      const step = await runStep(workflowAgent, failingState);
      failingState = step.state;
      failingSteps.push({
        status: step.state.status,
        text: textFromChunks(step.chunks),
        chunkTypes: step.chunks.map(chunk => chunk.type),
      });
      if (step.state.status !== 'ready_for_next_step') break;
    }

    const repeatedEmptyContinuations =
      failingSteps.length === 3 &&
      failingSteps.every(
        step => step.status === 'ready_for_next_step' && step.text === '',
      );
    const errorWasNotSurfaced = !JSON.stringify({
      failingState,
      failingSteps,
    }).includes(PROVIDER_ERROR);
    const failedRequestsRetainedReceipt = fixture.requests
      .slice(1)
      .every(request => JSON.stringify(request.body).includes(RECEIPT));
    if (!failedRequestsRetainedReceipt) {
      throw new Error(
        'Precondition failed: resumed provider request lost the earlier receipt',
      );
    }
    const healthyRequestWasNeverMade = fixture.requests.length === 4;

    console.log(
      JSON.stringify(
        {
          requestCount: fixture.requests.length,
          failedRequestsRetainedReceipt,
          firstTurn: {
            status: 'finished',
            text: warmupResult.text,
          },
          failingSteps,
        },
        null,
        2,
      ),
    );

    if (
      repeatedEmptyContinuations &&
      errorWasNotSurfaced &&
      healthyRequestWasNeverMade
    ) {
      throw new Error(FAILURE_SIGNAL);
    }

    if (failingState.status !== 'failed') {
      throw new Error(
        `Expected the provider rejection to produce failed state, received ${failingState.status}`,
      );
    }
  } finally {
    await sandboxSession.destroy();
    fixture.server.close();
    await once(fixture.server, 'close');
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
