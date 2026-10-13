import { createRequire } from 'node:module';

type CompletionHandle = {
  completion: { value: string };
  complete(prompt: string): Promise<string | null | undefined>;
  setCompletion(completion: string): void;
};

type UseCompletion = (options: {
  id: string;
  initialCompletion: string;
  streamProtocol?: 'text';
  fetch?: () => Promise<Response>;
}) => CompletionHandle;

type HostNode = Record<string, never>;

type HostRenderer = {
  createApp(component: unknown): {
    mount(container: HostNode): void;
    unmount(): void;
  };
};

type HostRendererOptions = {
  patchProp(...args: unknown[]): void;
  insert(...args: unknown[]): void;
  remove(...args: unknown[]): void;
  createElement(...args: unknown[]): HostNode;
  createText(...args: unknown[]): HostNode;
  createComment(...args: unknown[]): HostNode;
  setText(...args: unknown[]): void;
  setElementText(...args: unknown[]): void;
  parentNode(...args: unknown[]): null;
  nextSibling(...args: unknown[]): null;
  querySelector(...args: unknown[]): null;
  setScopeId(...args: unknown[]): void;
  cloneNode(node: HostNode): HostNode;
  insertStaticContent(...args: unknown[]): [HostNode, HostNode];
};

const require = createRequire(import.meta.url);
const { useCompletion } =
  require('../../../../packages/vue/src/use-completion') as {
    useCompletion: UseCompletion;
  };
const { createRenderer, defineComponent } =
  require('../../../../packages/vue/node_modules/vue') as {
    createRenderer(options: HostRendererOptions): HostRenderer;
    defineComponent(options: { setup(): () => null }): unknown;
  };

const INITIAL_COMPLETION = 'PREVIOUS';

async function settleSWRV() {
  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
}

async function main() {
  let releaseEmptyResponse!: () => void;
  const emptyResponseReady = new Promise<void>(resolve => {
    releaseEmptyResponse = resolve;
  });

  let manuallyCleared!: CompletionHandle;
  let requestCompletion!: CompletionHandle;

  const component = defineComponent({
    setup() {
      manuallyCleared = useCompletion({
        id: 'issue-19243-manual-clear',
        initialCompletion: INITIAL_COMPLETION,
      });

      requestCompletion = useCompletion({
        id: 'issue-19243-empty-response',
        initialCompletion: INITIAL_COMPLETION,
        streamProtocol: 'text',
        fetch: async () => {
          await emptyResponseReady;
          return new Response('', {
            headers: { 'Content-Type': 'text/plain' },
            status: 200,
          });
        },
      });

      return () => null;
    },
  });

  const renderer = createRenderer({
    patchProp: () => {},
    insert: () => {},
    remove: () => {},
    createElement: () => ({}),
    createText: () => ({}),
    createComment: () => ({}),
    setText: () => {},
    setElementText: () => {},
    parentNode: () => null,
    nextSibling: () => null,
    querySelector: () => null,
    setScopeId: () => {},
    cloneNode: node => ({ ...node }),
    insertStaticContent: () => [{}, {}],
  });

  Object.defineProperties(globalThis, {
    document: { configurable: true, value: new EventTarget() },
    navigator: { configurable: true, value: { onLine: true } },
    window: { configurable: true, value: new EventTarget() },
  });

  const app = renderer.createApp(component);
  app.mount({});

  try {
    await settleSWRV();
    manuallyCleared.setCompletion('');
    await settleSWRV();
    const afterManualClear = manuallyCleared.completion.value;

    const request = requestCompletion.complete('hi');
    await settleSWRV();
    const whileRequestIsPending = requestCompletion.completion.value;

    releaseEmptyResponse();
    const returnedCompletion = await request;
    await settleSWRV();
    const afterEmptyResponse = requestCompletion.completion.value;

    const failures = [
      ['manual clear', afterManualClear],
      ['request start', whileRequestIsPending],
      ['empty response', afterEmptyResponse],
    ].filter(([, completion]) => completion !== '');

    if (returnedCompletion !== '') {
      throw new Error(
        `Unexpected reproduction precondition: complete() returned ${JSON.stringify(returnedCompletion)} instead of an empty model result.`,
      );
    }

    if (failures.length > 0) {
      const observations = failures
        .map(
          ([scenario, completion]) =>
            `${scenario} rendered ${JSON.stringify(completion)}`,
        )
        .join('; ');

      throw new Error(
        `ISSUE_19243_REPRODUCED: expected completion.value to render "" after clearing and an empty model response, but ${observations}.`,
      );
    }

    console.log(
      'Issue #19243 is fixed: completion.value rendered "" after manual clearing, at request start, and after an empty model response.',
    );
  } finally {
    app.unmount();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
