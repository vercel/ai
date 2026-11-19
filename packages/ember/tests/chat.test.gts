import Component from '@glimmer/component';
import { DefaultChatTransport, type UIMessage, type UIMessageChunk } from 'ai';
import { describe, expect, test } from 'vitest';
import { Chat } from '../src/index';
import {
  createControlledStream,
  createFetch,
  render,
  uiMessageStreamResponse,
  type RecordedRequest,
} from './helpers';

type Part = UIMessage['parts'][number];

const textOf = (part: Part) => (part.type === 'text' ? part.text : '');

function idGenerator() {
  let next = 0;
  return () => `id-${next++}`;
}

function createChatFetch(respond: (request: RecordedRequest) => Response) {
  const { fetch, requests } = createFetch(respond);

  return {
    requests,
    transport: new DefaultChatTransport<UIMessage>({ api: '/api/chat', fetch }),
  };
}

interface ChatDemoSignature {
  Args: {
    transport: DefaultChatTransport<UIMessage>;
    messages?: UIMessage[];
  };
}

class ChatDemo extends Component<ChatDemoSignature> {
  chat = new Chat(this, {
    generateId: idGenerator(),
    transport: this.args.transport,
    messages: this.args.messages,
  });

  send = (event: SubmitEvent) => {
    event.preventDefault();

    const form = event.target as HTMLFormElement;
    const input = form.elements.namedItem('text') as HTMLInputElement;

    void this.chat.sendMessage({ text: input.value });
    input.value = '';
  };

  <template>
    <ul>
      {{#each this.chat.messages key="id" as |message|}}
        <li data-role={{message.role}}>
          {{#each message.parts key="@index" as |part|}}{{textOf
              part
            }}{{/each}}
        </li>
      {{/each}}
    </ul>

    <output>{{this.chat.status}}</output>

    {{#if this.chat.error}}
      <p role="alert">{{this.chat.error.message}}</p>
    {{/if}}

    <form {{on "submit" this.send}}>
      <input name="text" aria-label="Message" />
      <button type="submit">Send</button>
    </form>

    <button type="button" {{on "click" this.chat.stop}}>Stop</button>
  </template>
}

describe('Chat', () => {
  test('renders the streamed reply while it arrives', async () => {
    const response = createControlledStream<UIMessageChunk>();
    const { transport, requests } = createChatFetch(() =>
      uiMessageStreamResponse(response.stream),
    );

    const { screen } = render(<template><ChatDemo @transport={{transport}} /></template>);

    await screen.getByRole('textbox', { name: 'Message' }).fill('Hi');
    await screen.getByRole('button', { name: 'Send' }).click();

    await expect
      .element(screen.getByRole('listitem').first())
      .toHaveTextContent('Hi');
    await expect.element(screen.getByRole('status')).toHaveTextContent('submitted');

    response.write({ type: 'start' });
    response.write({ type: 'text-start', id: 't' });
    response.write({ type: 'text-delta', id: 't', delta: 'Hello' });

    await expect
      .element(screen.getByRole('listitem').nth(1))
      .toHaveTextContent('Hello');
    await expect.element(screen.getByRole('status')).toHaveTextContent('streaming');

    response.write({ type: 'text-delta', id: 't', delta: ', world.' });

    await expect
      .element(screen.getByRole('listitem').nth(1))
      .toHaveTextContent('Hello, world.');

    response.write({ type: 'text-end', id: 't' });
    response.write({ type: 'finish' });
    response.close();

    await expect.element(screen.getByRole('status')).toHaveTextContent('ready');

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('/api/chat');
    expect(requests[0].body).toMatchObject({
      messages: [{ role: 'user', parts: [{ type: 'text', text: 'Hi' }] }],
    });
  });

  test('renders the initial messages', async () => {
    const { transport } = createChatFetch(() => new Response(null));
    const messages: UIMessage[] = [
      { id: 'a', role: 'user', parts: [{ type: 'text', text: 'Question' }] },
      { id: 'b', role: 'assistant', parts: [{ type: 'text', text: 'Answer' }] },
    ];

    const { screen } = render(
      <template><ChatDemo @transport={{transport}} @messages={{messages}} /></template>,
    );

    await expect
      .element(screen.getByRole('listitem').first())
      .toHaveTextContent('Question');
    await expect
      .element(screen.getByRole('listitem').nth(1))
      .toHaveTextContent('Answer');
    await expect.element(screen.getByRole('status')).toHaveTextContent('ready');
  });

  test('shows the error of a failed request', async () => {
    const { transport } = createChatFetch(
      () => new Response('Not found', { status: 404 }),
    );

    const { screen } = render(<template><ChatDemo @transport={{transport}} /></template>);

    await screen.getByRole('textbox', { name: 'Message' }).fill('Hi');
    await screen.getByRole('button', { name: 'Send' }).click();

    await expect.element(screen.getByRole('alert')).toHaveTextContent('Not found');
    await expect.element(screen.getByRole('status')).toHaveTextContent('error');
  });

  test('stop keeps the text that arrived', async () => {
    const response = createControlledStream<UIMessageChunk>();
    const { transport, requests } = createChatFetch(() =>
      uiMessageStreamResponse(response.stream),
    );

    const { screen } = render(<template><ChatDemo @transport={{transport}} /></template>);

    await screen.getByRole('textbox', { name: 'Message' }).fill('Hi');
    await screen.getByRole('button', { name: 'Send' }).click();

    response.write({ type: 'start' });
    response.write({ type: 'text-start', id: 't' });
    response.write({ type: 'text-delta', id: 't', delta: 'Partial' });

    await expect
      .element(screen.getByRole('listitem').nth(1))
      .toHaveTextContent('Partial');

    await screen.getByRole('button', { name: 'Stop' }).click();

    await expect.element(screen.getByRole('status')).toHaveTextContent('ready');
    await expect
      .element(screen.getByRole('listitem').nth(1))
      .toHaveTextContent('Partial');
    expect(requests[0].signal?.aborted).toBe(true);
  });

  test('destroying the component aborts the request', async () => {
    const response = createControlledStream<UIMessageChunk>();
    const { transport, requests } = createChatFetch(() =>
      uiMessageStreamResponse(response.stream),
    );

    const { screen, unmount } = render(
      <template><ChatDemo @transport={{transport}} /></template>,
    );

    await screen.getByRole('textbox', { name: 'Message' }).fill('Hi');
    await screen.getByRole('button', { name: 'Send' }).click();

    response.write({ type: 'start' });
    response.write({ type: 'text-start', id: 't' });
    response.write({ type: 'text-delta', id: 't', delta: 'Partial' });

    await expect
      .element(screen.getByRole('listitem').nth(1))
      .toHaveTextContent('Partial');

    unmount();

    await expect.poll(() => requests[0].signal?.aborted).toBe(true);
  });

  test('works without a parent', async () => {
    const response = createControlledStream<UIMessageChunk>();
    const { transport } = createChatFetch(() =>
      uiMessageStreamResponse(response.stream),
    );
    const chat = new Chat({ generateId: idGenerator(), transport });

    const { screen } = render(
      <template>
        <output>{{chat.status}}</output>
        {{#each chat.messages key="id" as |message|}}
          <p>{{#each message.parts key="@index" as |part|}}{{textOf part}}{{/each}}</p>
        {{/each}}
      </template>,
    );

    void chat.sendMessage({ text: 'Hi' });

    response.write({ type: 'start' });
    response.write({ type: 'text-start', id: 't' });
    response.write({ type: 'text-delta', id: 't', delta: 'Hello' });
    response.write({ type: 'text-end', id: 't' });
    response.write({ type: 'finish' });
    response.close();

    await expect.element(screen.getByText('Hello')).toBeInTheDocument();
    await expect.element(screen.getByRole('status')).toHaveTextContent('ready');
  });
});
