import { createRequire } from 'node:module';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import {
  callCompletionApi,
  DefaultChatTransport,
} from '../../../../packages/ai/src/index';

const fallbackChatMessage = 'Failed to fetch the chat response.';
const fallbackObjectMessage = 'Failed to fetch the response.';

const emptyErrorFetch = async () => new Response(null, { status: 502 });

async function captureThrownError(
  label: string,
  operation: () => Promise<unknown>,
): Promise<Error> {
  try {
    await operation();
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }

    throw new Error(`${label} threw a non-Error value.`);
  }

  throw new Error(`${label} unexpectedly succeeded.`);
}

async function reproduceChatSendMessages(): Promise<Error> {
  const transport = new DefaultChatTransport({
    api: '/api/chat',
    fetch: emptyErrorFetch,
  });

  return captureThrownError('DefaultChatTransport.sendMessages', () =>
    transport.sendMessages({
      trigger: 'submit-message',
      chatId: 'issue-20107',
      messageId: 'message-1',
      messages: [],
      abortSignal: undefined,
      body: undefined,
      headers: undefined,
      metadata: undefined,
    }),
  );
}

async function reproduceChatReconnect(): Promise<Error> {
  const transport = new DefaultChatTransport({
    api: '/api/chat',
    fetch: emptyErrorFetch,
  });

  return captureThrownError('DefaultChatTransport.reconnectToStream', () =>
    transport.reconnectToStream({
      chatId: 'issue-20107',
      abortSignal: undefined,
      body: undefined,
      headers: undefined,
      metadata: undefined,
    }),
  );
}

async function reproduceCompletion(): Promise<Error> {
  let observedError: Error | undefined;

  await callCompletionApi({
    api: '/api/completion',
    prompt: 'test',
    credentials: undefined,
    headers: undefined,
    body: {},
    streamProtocol: 'text',
    setCompletion: () => {},
    setLoading: () => {},
    setError: error => {
      observedError = error;
    },
    setAbortController: () => {},
    onFinish: undefined,
    onError: undefined,
    fetch: emptyErrorFetch,
  });

  if (observedError == null) {
    throw new Error('callCompletionApi did not surface the HTTP error.');
  }

  return observedError;
}

async function reproduceReactUseObject(): Promise<Error> {
  const requireFromReactPackage = createRequire(
    new URL('../../../../packages/react/package.json', import.meta.url),
  );
  const React = requireFromReactPackage('react');
  const { createRoot } = requireFromReactPackage('react-dom/client');
  const { JSDOM } = requireFromReactPackage('jsdom');
  const reactUseObjectModule = '../../../../packages/react/src/use-object';
  const { experimental_useObject: useObject } = await import(
    reactUseObjectModule
  );

  const dom = new JSDOM('<!doctype html><div id="root"></div>', {
    url: 'http://localhost',
  });
  const globalNames = [
    'window',
    'document',
    'navigator',
    'HTMLElement',
    'Node',
    'MutationObserver',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'IS_REACT_ACT_ENVIRONMENT',
  ] as const;
  const previousDescriptors = new Map(
    globalNames.map(name => [
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    ]),
  );

  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window },
    document: { configurable: true, value: dom.window.document },
    navigator: { configurable: true, value: dom.window.navigator },
    HTMLElement: { configurable: true, value: dom.window.HTMLElement },
    Node: { configurable: true, value: dom.window.Node },
    MutationObserver: {
      configurable: true,
      value: dom.window.MutationObserver,
    },
    requestAnimationFrame: {
      configurable: true,
      value: (callback: FrameRequestCallback) => setTimeout(callback, 0),
    },
    cancelAnimationFrame: {
      configurable: true,
      value: (handle: number) => clearTimeout(handle),
    },
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
  });

  let helpers:
    | {
        error: Error | undefined;
        submit: (input: unknown) => Promise<void>;
      }
    | undefined;
  const Component = () => {
    helpers = useObject({
      api: '/api/object',
      schema: {} as never,
      fetch: emptyErrorFetch,
    });
    return null;
  };
  const container = dom.window.document.getElementById('root');
  if (container == null) {
    throw new Error('React reproduction root was not created.');
  }
  const root = createRoot(container);

  try {
    await React.act(async () => {
      root.render(React.createElement(Component));
    });

    const initializedHelpers = helpers;
    if (initializedHelpers == null) {
      throw new Error('React useObject hook did not initialize.');
    }

    await React.act(async () => {
      await initializedHelpers.submit({});
    });

    const updatedHelpers = helpers;
    if (updatedHelpers?.error == null) {
      throw new Error('React useObject did not surface the HTTP error.');
    }

    return updatedHelpers.error;
  } finally {
    await React.act(async () => {
      root.unmount();
    });
    dom.window.close();

    for (const name of globalNames) {
      const descriptor = previousDescriptors.get(name);
      if (descriptor == null) {
        delete (globalThis as Record<string, unknown>)[name];
      } else {
        Object.defineProperty(globalThis, name, descriptor);
      }
    }
  }
}

async function reproduceSvelteStructuredObject(): Promise<Error> {
  const packageDirectory = fileURLToPath(
    new URL('../../../../packages/svelte/', import.meta.url),
  );
  const sourceDirectory = `${packageDirectory}src`;
  const temporaryDirectory = `${sourceDirectory}/.issue-20107-reproduction`;
  const requireFromSveltePackage = createRequire(
    new URL('../../../../packages/svelte/package.json', import.meta.url),
  );
  const { compileModule } = requireFromSveltePackage('svelte/compiler');

  const transpile = async (filename: string) =>
    ts.transpileModule(
      await readFile(`${sourceDirectory}/${filename}`, 'utf8'),
      {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
        fileName: filename,
      },
    ).outputText;

  await rm(temporaryDirectory, { force: true, recursive: true });
  await mkdir(temporaryDirectory);

  try {
    const mainJavaScript = await transpile('structured-object.svelte.ts');
    const contextJavaScript = await transpile(
      'structured-object-context.svelte.ts',
    );
    const utilsJavaScript = await transpile('utils.svelte.ts');

    await Promise.all([
      writeFile(
        `${temporaryDirectory}/structured-object.svelte.js`,
        compileModule(mainJavaScript, {
          filename: 'structured-object.svelte.js',
          generate: 'client',
        }).js.code,
      ),
      writeFile(
        `${temporaryDirectory}/structured-object-context.svelte.js`,
        compileModule(contextJavaScript, {
          filename: 'structured-object-context.svelte.js',
          generate: 'client',
        }).js.code,
      ),
      writeFile(`${temporaryDirectory}/utils.svelte.js`, utilsJavaScript),
    ]);

    const { StructuredObject } = await import(
      `${temporaryDirectory}/structured-object.svelte.js`
    );
    const structuredObject = new StructuredObject({
      api: '/api/object',
      schema: {},
      fetch: emptyErrorFetch,
    });

    await structuredObject.submit({});

    if (structuredObject.error == null) {
      throw new Error(
        'Svelte StructuredObject did not surface the HTTP error.',
      );
    }

    return structuredObject.error;
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
}

async function reproduceAngularStructuredObject(): Promise<Error> {
  const angularStructuredObjectModule =
    '../../../../packages/angular/src/lib/structured-object.ng';
  const { StructuredObject } = await import(angularStructuredObjectModule);
  const structuredObject = new StructuredObject({
    api: '/api/object',
    schema: {} as never,
    fetch: emptyErrorFetch,
  });

  await structuredObject.submit({});

  if (structuredObject.error == null) {
    throw new Error('Angular StructuredObject did not surface the HTTP error.');
  }

  return structuredObject.error;
}

async function main() {
  const emptyBodyText = await new Response(null, { status: 502 }).text();
  if (emptyBodyText !== '') {
    throw new Error(
      `Expected Response.text() for an empty body to be "", received ${JSON.stringify(emptyBodyText)}.`,
    );
  }

  const observations = [
    {
      label: 'DefaultChatTransport.sendMessages',
      expected: fallbackChatMessage,
      error: await reproduceChatSendMessages(),
    },
    {
      label: 'DefaultChatTransport.reconnectToStream',
      expected: fallbackChatMessage,
      error: await reproduceChatReconnect(),
    },
    {
      label: 'callCompletionApi',
      expected: fallbackChatMessage,
      error: await reproduceCompletion(),
    },
    {
      label: 'React useObject',
      expected: fallbackObjectMessage,
      error: await reproduceReactUseObject(),
    },
    {
      label: 'Svelte StructuredObject',
      expected: fallbackObjectMessage,
      error: await reproduceSvelteStructuredObject(),
    },
    {
      label: 'Angular StructuredObject',
      expected: fallbackObjectMessage,
      error: await reproduceAngularStructuredObject(),
    },
  ];

  for (const { label, expected, error } of observations) {
    console.log(
      `${label}: error.message=${JSON.stringify(error.message)}; expected=${JSON.stringify(expected)}`,
    );
  }

  const emptyMessages = observations
    .filter(({ error }) => error.message === '')
    .map(({ label }) => label);
  const incorrectNonEmptyMessages = observations.filter(
    ({ error, expected }) => error.message !== '' && error.message !== expected,
  );

  if (incorrectNonEmptyMessages.length > 0) {
    throw new Error(
      `Unexpected non-empty messages: ${incorrectNonEmptyMessages
        .map(
          ({ label, error, expected }) =>
            `${label}=${JSON.stringify(error.message)} (expected ${JSON.stringify(expected)})`,
        )
        .join(', ')}`,
    );
  }

  if (emptyMessages.length > 0) {
    console.error(
      `ISSUE_20107_REPRODUCED: empty HTTP error messages in ${emptyMessages.join(', ')}`,
    );
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
