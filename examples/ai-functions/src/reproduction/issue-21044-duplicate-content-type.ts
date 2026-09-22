import { createServer } from 'node:http';
import {
  DefaultChatTransport,
  type HttpChatTransportInitOptions,
  TextStreamChatTransport,
  type UIMessage,
} from 'ai';

type TransportName = 'default' | 'text';
type HeaderPath = 'constructor' | 'request' | 'prepared';

type ReproductionCase = {
  label: string;
  transportName: TransportName;
  expectedContentType: string;
  configured: boolean;
  headerPath?: HeaderPath;
  expectedControlHeader?: string;
};

type ReceivedRequest = {
  contentType: string | undefined;
  controlHeader: string | undefined;
};

const configuredContentTypes = [
  'application/json',
  'application/json; charset=utf-8',
] as const;

function createTransport(
  transportName: TransportName,
  options: HttpChatTransportInitOptions<UIMessage>,
) {
  return transportName === 'default'
    ? new DefaultChatTransport(options)
    : new TextStreamChatTransport(options);
}

async function main() {
  const received = new Map<string, ReceivedRequest>();
  const server = createServer((request, response) => {
    const label = request.url?.slice(1);

    if (label != null) {
      received.set(label, {
        contentType: request.headers['content-type'],
        controlHeader: request.headers['x-control'],
      });
    }

    request.resume();
    response.writeHead(200, {
      'Content-Type': label?.startsWith('text-')
        ? 'text/plain; charset=utf-8'
        : 'text/event-stream',
    });
    response.end();
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (address == null || typeof address === 'string') {
    throw new Error('Missing local server address.');
  }

  const cases: ReproductionCase[] = [];

  for (const transportName of ['default', 'text'] as const) {
    cases.push(
      {
        label: `${transportName}-control-default`,
        transportName,
        expectedContentType: 'application/json',
        configured: false,
      },
      {
        label: `${transportName}-control-unrelated-header`,
        transportName,
        expectedContentType: 'application/json',
        expectedControlHeader: 'preserved',
        configured: false,
      },
    );

    for (const headerPath of ['constructor', 'request', 'prepared'] as const) {
      for (const contentType of configuredContentTypes) {
        cases.push({
          label: `${transportName}-${headerPath}-${contentType.includes(';') ? 'charset' : 'json'}`,
          transportName,
          headerPath,
          expectedContentType: contentType,
          configured: true,
        });
      }
    }
  }

  try {
    for (const reproductionCase of cases) {
      const api = `http://127.0.0.1:${address.port}/${reproductionCase.label}`;
      const options: HttpChatTransportInitOptions<UIMessage> = { api };
      let requestHeaders: Record<string, string> | undefined;

      if (reproductionCase.headerPath === 'constructor') {
        options.headers = {
          'Content-Type': reproductionCase.expectedContentType,
        };
      } else if (reproductionCase.headerPath === 'request') {
        requestHeaders = {
          'Content-Type': reproductionCase.expectedContentType,
        };
      } else if (reproductionCase.headerPath === 'prepared') {
        options.prepareSendMessagesRequest = () => ({
          body: {},
          headers: {
            'Content-Type': reproductionCase.expectedContentType,
          },
        });
      } else if (reproductionCase.expectedControlHeader != null) {
        options.headers = {
          'X-Control': reproductionCase.expectedControlHeader,
        };
      }

      const transport = createTransport(
        reproductionCase.transportName,
        options,
      );
      const stream = await transport.sendMessages({
        chatId: 'issue-21044',
        messages: [],
        trigger: 'submit-message',
        messageId: undefined,
        abortSignal: undefined,
        headers: requestHeaders,
      });

      for await (const chunk of stream) {
        void chunk;
      }
    }
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => {
        if (error == null) {
          resolve();
        } else {
          reject(error);
        }
      });
    });
  }

  const controlFailures = cases.filter(reproductionCase => {
    if (reproductionCase.configured) {
      return false;
    }

    const actual = received.get(reproductionCase.label);
    return (
      actual?.contentType !== reproductionCase.expectedContentType ||
      (reproductionCase.expectedControlHeader != null &&
        actual.controlHeader !== reproductionCase.expectedControlHeader)
    );
  });

  if (controlFailures.length > 0) {
    console.error(
      `ISSUE_21044_CONTROL_FAILURE: ${controlFailures.length} control requests failed.`,
    );
    process.exitCode = 1;
    return;
  }

  const configuredFailures = cases.filter(reproductionCase => {
    if (!reproductionCase.configured) {
      return false;
    }

    return (
      received.get(reproductionCase.label)?.contentType !==
      reproductionCase.expectedContentType
    );
  });

  if (configuredFailures.length > 0) {
    console.error(
      `ISSUE_21044_DUPLICATE_CONTENT_TYPE: ${configuredFailures.length} configured requests did not send the configured content type exactly once.`,
    );
    for (const failure of configuredFailures) {
      console.error(
        `${failure.label}: expected=${JSON.stringify(failure.expectedContentType)} actual=${JSON.stringify(received.get(failure.label)?.contentType)}`,
      );
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    'PASS: all configured requests sent the configured content type exactly once.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
