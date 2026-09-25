import { createServer } from 'node:http';
import {
  DefaultChatTransport,
  TextStreamChatTransport,
  type ChatTransport,
  type UIMessage,
} from 'ai';

type TransportName = 'default' | 'text';
type HeaderSource = 'constructor' | 'request' | 'prepare';

type ReceivedRequest = {
  contentType: string | undefined;
  reproCase: string | undefined;
  unrelatedHeader: string | undefined;
};

type ConfiguredCase = {
  transport: TransportName;
  source: HeaderSource;
  contentType: string;
};

const configuredCases: ConfiguredCase[] = (
  ['default', 'text'] as const
).flatMap(transport =>
  (['constructor', 'request', 'prepare'] as const).flatMap(source =>
    ['application/json', 'application/json; charset=utf-8'].map(
      contentType => ({ transport, source, contentType }),
    ),
  ),
);

function createTransport({
  api,
  transport,
  source,
  headers,
}: {
  api: string;
  transport: TransportName;
  source?: HeaderSource;
  headers?: Record<string, string>;
}): ChatTransport<UIMessage> {
  const Transport =
    transport === 'default'
      ? DefaultChatTransport<UIMessage>
      : TextStreamChatTransport<UIMessage>;

  return new Transport({
    api,
    headers: source === 'constructor' ? headers : undefined,
    prepareSendMessagesRequest:
      source === 'prepare'
        ? () => ({
            body: {},
            headers,
          })
        : undefined,
  });
}

async function sendRequest({
  api,
  transport,
  source,
  headers,
}: {
  api: string;
  transport: TransportName;
  source?: HeaderSource;
  headers?: Record<string, string>;
}) {
  const stream = await createTransport({
    api,
    transport,
    source,
    headers,
  }).sendMessages({
    chatId: 'synthetic-chat',
    messages: [],
    trigger: 'submit-message',
    messageId: undefined,
    abortSignal: undefined,
    headers: source === 'request' ? headers : undefined,
  });

  const reader = stream.getReader();
  while (!(await reader.read()).done) {
    // Drain the response stream so each request completes before the next case.
  }
}

async function main() {
  const received: ReceivedRequest[] = [];
  const server = createServer((request, response) => {
    const contentType = request.headers['content-type'];
    const reproCase = request.headers['x-repro-case'];
    const unrelatedHeader = request.headers['x-unrelated-header'];

    received.push({
      contentType: Array.isArray(contentType)
        ? contentType.join(', ')
        : contentType,
      reproCase: Array.isArray(reproCase) ? reproCase.join(', ') : reproCase,
      unrelatedHeader: Array.isArray(unrelatedHeader)
        ? unrelatedHeader.join(', ')
        : unrelatedHeader,
    });
    request.resume();
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.end();
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Missing local server address.');
  }

  const api = `http://127.0.0.1:${address.port}/chat`;

  try {
    for (const transport of ['default', 'text'] as const) {
      await sendRequest({ api, transport });
      await sendRequest({
        api,
        transport,
        source: 'constructor',
        headers: {
          'X-Repro-Case': `${transport}-unrelated-control`,
          'X-Unrelated-Header': 'preserved',
        },
      });
    }

    for (const testCase of configuredCases) {
      const reproCase = [
        testCase.transport,
        testCase.source,
        testCase.contentType,
      ].join('|');

      await sendRequest({
        api,
        transport: testCase.transport,
        source: testCase.source,
        headers: {
          'Content-Type': testCase.contentType,
          'X-Repro-Case': reproCase,
        },
      });
    }
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  const controls = received.slice(0, 4);
  const expectedControls: ReceivedRequest[] = [
    {
      contentType: 'application/json',
      reproCase: undefined,
      unrelatedHeader: undefined,
    },
    {
      contentType: 'application/json',
      reproCase: 'default-unrelated-control',
      unrelatedHeader: 'preserved',
    },
    {
      contentType: 'application/json',
      reproCase: undefined,
      unrelatedHeader: undefined,
    },
    {
      contentType: 'application/json',
      reproCase: 'text-unrelated-control',
      unrelatedHeader: 'preserved',
    },
  ];

  if (JSON.stringify(controls) !== JSON.stringify(expectedControls)) {
    throw new Error(
      `Control requests did not behave as expected: ${JSON.stringify(controls)}`,
    );
  }

  const configuredResults = received.slice(4);
  if (configuredResults.length !== configuredCases.length) {
    throw new Error(
      `Expected ${configuredCases.length} configured requests, received ${configuredResults.length}.`,
    );
  }

  const failures = configuredCases.flatMap((testCase, index) => {
    const actual = configuredResults[index];
    const expectedReproCase = [
      testCase.transport,
      testCase.source,
      testCase.contentType,
    ].join('|');

    return actual.contentType === testCase.contentType &&
      actual.reproCase === expectedReproCase
      ? []
      : [
          {
            ...testCase,
            expected: testCase.contentType,
            received: actual.contentType,
            reproCase: actual.reproCase,
          },
        ];
  });

  console.log(
    JSON.stringify(
      {
        controls,
        configuredRequestCount: configuredCases.length,
        failures,
      },
      null,
      2,
    ),
  );

  if (failures.length > 0) {
    throw new Error(
      `Reproduced issue #21044: ${failures.length} configured Content-Type headers reached the HTTP server with duplicate values instead of one configured value.`,
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
