import { createServer } from 'node:http';
import {
  DefaultChatTransport,
  TextStreamChatTransport,
  type UIMessage,
} from 'ai';

type HeaderPath = 'constructor' | 'per-request' | 'prepare-request';
type TransportName = 'DefaultChatTransport' | 'TextStreamChatTransport';

type TestCase = {
  name: string;
  transportName: TransportName;
  headerPath?: HeaderPath;
  contentType?: string;
  unrelatedHeader?: string;
};

const testCases: TestCase[] = [
  {
    name: 'DefaultChatTransport default header',
    transportName: 'DefaultChatTransport',
  },
  {
    name: 'DefaultChatTransport unrelated header',
    transportName: 'DefaultChatTransport',
    unrelatedHeader: 'default-control',
  },
  {
    name: 'TextStreamChatTransport default header',
    transportName: 'TextStreamChatTransport',
  },
  {
    name: 'TextStreamChatTransport unrelated header',
    transportName: 'TextStreamChatTransport',
    unrelatedHeader: 'text-control',
  },
  ...(['DefaultChatTransport', 'TextStreamChatTransport'] as const).flatMap(
    transportName =>
      (['constructor', 'per-request', 'prepare-request'] as const).flatMap(
        headerPath =>
          ['application/json', 'application/json; charset=utf-8'].map(
            contentType => ({
              name: `${transportName} ${headerPath} ${contentType}`,
              transportName,
              headerPath,
              contentType,
            }),
          ),
      ),
  ),
];

async function main() {
  const received: Array<{
    contentType: string | undefined;
    unrelatedHeader: string | undefined;
  }> = [];

  const server = createServer((request, response) => {
    const contentType = request.headers['content-type'];
    const unrelatedHeader = request.headers['x-issue-21044-control'];
    received.push({
      contentType: Array.isArray(contentType)
        ? contentType.join(', ')
        : contentType,
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
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Missing local server address.');
  }

  try {
    for (const testCase of testCases) {
      const configuredHeaders: Record<string, string> | undefined =
        testCase.contentType
          ? { 'Content-Type': testCase.contentType }
          : testCase.unrelatedHeader
            ? { 'X-Issue-21044-Control': testCase.unrelatedHeader }
            : undefined;

      const transportOptions = {
        api: `http://127.0.0.1:${address.port}/chat`,
        headers:
          testCase.headerPath === 'constructor' ||
          testCase.unrelatedHeader !== undefined
            ? configuredHeaders
            : undefined,
        prepareSendMessagesRequest:
          testCase.headerPath === 'prepare-request'
            ? () => ({ body: {}, headers: configuredHeaders })
            : undefined,
      };

      const transport =
        testCase.transportName === 'DefaultChatTransport'
          ? new DefaultChatTransport<UIMessage>(transportOptions)
          : new TextStreamChatTransport<UIMessage>(transportOptions);

      const stream = await transport.sendMessages({
        chatId: 'synthetic-chat',
        messages: [],
        trigger: 'submit-message',
        messageId: undefined,
        abortSignal: undefined,
        headers:
          testCase.headerPath === 'per-request' ? configuredHeaders : undefined,
      });

      const reader = stream.getReader();
      while (!(await reader.read()).done) {
        // Drain the response so the request completes before the next case.
      }
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

  const failures: string[] = [];

  for (const [index, testCase] of testCases.entries()) {
    const actual = received[index];
    const expectedContentType = testCase.contentType ?? 'application/json';

    if (actual?.contentType !== expectedContentType) {
      failures.push(
        `${testCase.name}: expected ${JSON.stringify(expectedContentType)}, received ${JSON.stringify(actual?.contentType)}`,
      );
    }

    if (
      testCase.unrelatedHeader !== undefined &&
      actual?.unrelatedHeader !== testCase.unrelatedHeader
    ) {
      failures.push(
        `${testCase.name}: expected unrelated header ${JSON.stringify(testCase.unrelatedHeader)}, received ${JSON.stringify(actual?.unrelatedHeader)}`,
      );
    }
  }

  console.log(
    JSON.stringify(
      testCases.map((testCase, index) => ({
        case: testCase.name,
        received: received[index],
      })),
      null,
      2,
    ),
  );

  if (failures.length > 0) {
    throw new Error(
      `ISSUE_21044_DUPLICATE_CONTENT_TYPE: ${failures.length} assertions failed\n${failures.join('\n')}`,
    );
  }
}

await main();
