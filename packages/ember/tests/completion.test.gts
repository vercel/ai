import Component from '@glimmer/component';
import type { UIMessageChunk } from 'ai';
import { describe, expect, test } from 'vitest';
import { Completion, type CompletionOptions } from '../src/index';
import {
  createControlledStream,
  createFetch,
  render,
  textResponse,
  uiMessageStreamResponse,
} from './helpers';

interface CompletionDemoSignature {
  Args: {
    options: CompletionOptions;
  };
}

class CompletionDemo extends Component<CompletionDemoSignature> {
  completion = new Completion(this, this.args.options);

  updateInput = (event: Event) => {
    this.completion.input = (event.target as HTMLInputElement).value;
  };

  <template>
    <form {{on "submit" this.completion.handleSubmit}}>
      <input
        aria-label="Prompt"
        value={{this.completion.input}}
        {{on "input" this.updateInput}}
      />
      <button type="submit">Complete</button>
    </form>

    <button type="button" {{on "click" this.completion.stop}}>Stop</button>

    <output>{{this.completion.completion}}</output>

    {{#if this.completion.loading}}
      <p>Loading</p>
    {{/if}}

    {{#if this.completion.error}}
      <p role="alert">{{this.completion.error.message}}</p>
    {{/if}}
  </template>
}

describe('Completion', () => {
  test('renders a data stream while it arrives', async () => {
    const response = createControlledStream<UIMessageChunk>();
    const { fetch, requests } = createFetch(() =>
      uiMessageStreamResponse(response.stream),
    );
    const options: CompletionOptions = { fetch, body: { mode: 'test' } };

    const { screen } = render(
      <template><CompletionDemo @options={{options}} /></template>,
    );

    await screen.getByRole('textbox', { name: 'Prompt' }).fill('Say hello');
    await screen.getByRole('button', { name: 'Complete' }).click();

    await expect.element(screen.getByText('Loading')).toBeInTheDocument();

    response.write({ type: 'text-start', id: 't' });
    response.write({ type: 'text-delta', id: 't', delta: 'Hello' });

    await expect.element(screen.getByRole('status')).toHaveTextContent('Hello');

    response.write({ type: 'text-delta', id: 't', delta: ', world.' });
    response.write({ type: 'text-end', id: 't' });
    response.close();

    await expect
      .element(screen.getByRole('status'))
      .toHaveTextContent('Hello, world.');
    await expect.element(screen.getByText('Loading')).not.toBeInTheDocument();

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('/api/completion');
    expect(requests[0].body).toEqual({ prompt: 'Say hello', mode: 'test' });
  });

  test('renders a text stream', async () => {
    const { fetch } = createFetch(() => textResponse(['Hello', ', ', 'world.']));
    const options: CompletionOptions = { fetch, streamProtocol: 'text' };

    const { screen } = render(
      <template><CompletionDemo @options={{options}} /></template>,
    );

    await screen.getByRole('textbox', { name: 'Prompt' }).fill('Say hello');
    await screen.getByRole('button', { name: 'Complete' }).click();

    await expect
      .element(screen.getByRole('status'))
      .toHaveTextContent('Hello, world.');
  });

  test('stop aborts the request and keeps the text', async () => {
    const response = createControlledStream<string>();
    const { fetch, requests } = createFetch(
      () =>
        new Response(response.stream.pipeThrough(new TextEncoderStream()), {
          status: 200,
        }),
    );
    const options: CompletionOptions = { fetch, streamProtocol: 'text' };

    const { screen } = render(
      <template><CompletionDemo @options={{options}} /></template>,
    );

    await screen.getByRole('textbox', { name: 'Prompt' }).fill('Say hello');
    await screen.getByRole('button', { name: 'Complete' }).click();

    response.write('Partial');

    await expect.element(screen.getByRole('status')).toHaveTextContent('Partial');

    await screen.getByRole('button', { name: 'Stop' }).click();

    await expect.element(screen.getByText('Loading')).not.toBeInTheDocument();
    await expect.element(screen.getByRole('status')).toHaveTextContent('Partial');
    expect(requests[0].signal?.aborted).toBe(true);
  });

  test('shows the error and clears it on the next request', async () => {
    let fail = true;
    const { fetch } = createFetch(() =>
      fail
        ? new Response('Server down', { status: 500 })
        : textResponse(['Recovered']),
    );
    const options: CompletionOptions = { fetch, streamProtocol: 'text' };

    const { screen } = render(
      <template><CompletionDemo @options={{options}} /></template>,
    );

    await screen.getByRole('textbox', { name: 'Prompt' }).fill('Say hello');
    await screen.getByRole('button', { name: 'Complete' }).click();

    await expect.element(screen.getByRole('alert')).toHaveTextContent('Server down');
    await expect.element(screen.getByText('Loading')).not.toBeInTheDocument();

    fail = false;
    await screen.getByRole('button', { name: 'Complete' }).click();

    await expect.element(screen.getByRole('status')).toHaveTextContent('Recovered');
    await expect.element(screen.getByRole('alert')).not.toBeInTheDocument();
  });

  test('calls onFinish with the prompt and the completion', async () => {
    const finished: string[] = [];
    const { fetch } = createFetch(() => textResponse(['Done']));
    const options: CompletionOptions = {
      fetch,
      streamProtocol: 'text',
      onFinish: (prompt, completion) => {
        finished.push(`${prompt} -> ${completion}`);
      },
    };

    const { screen } = render(
      <template><CompletionDemo @options={{options}} /></template>,
    );

    await screen.getByRole('textbox', { name: 'Prompt' }).fill('Finish');
    await screen.getByRole('button', { name: 'Complete' }).click();

    await expect.poll(() => finished).toEqual(['Finish -> Done']);
  });

  test('destroying the component aborts the request', async () => {
    const response = createControlledStream<string>();
    const { fetch, requests } = createFetch(
      () =>
        new Response(response.stream.pipeThrough(new TextEncoderStream()), {
          status: 200,
        }),
    );
    const options: CompletionOptions = { fetch, streamProtocol: 'text' };

    const { screen, unmount } = render(
      <template><CompletionDemo @options={{options}} /></template>,
    );

    await screen.getByRole('textbox', { name: 'Prompt' }).fill('Say hello');
    await screen.getByRole('button', { name: 'Complete' }).click();

    response.write('Partial');
    await expect.element(screen.getByRole('status')).toHaveTextContent('Partial');

    unmount();

    await expect.poll(() => requests[0].signal?.aborted).toBe(true);
  });
});
