import Component from '@glimmer/component';
import { describe, expect, test } from 'vitest';
import { z } from 'zod/v4';
import { StructuredObject, type StructuredObjectOptions } from '../src/index';
import {
  createControlledStream,
  createFetch,
  render,
  textResponse,
  textStreamResponse,
} from './helpers';

const schema = z.object({ content: z.string() });

type Options = StructuredObjectOptions<typeof schema>;

interface ObjectDemoSignature {
  Args: {
    options: Options;
  };
}

class ObjectDemo extends Component<ObjectDemoSignature> {
  structuredObject = new StructuredObject(this, this.args.options);

  submit = () => {
    void this.structuredObject.submit('test-input');
  };

  <template>
    <button type="button" {{on "click" this.submit}}>Generate</button>
    <button type="button" {{on "click" this.structuredObject.stop}}>Stop</button>
    <button type="button" {{on "click" this.structuredObject.clear}}>Clear</button>

    <output>{{this.structuredObject.object.content}}</output>

    {{#if this.structuredObject.loading}}
      <p>Loading</p>
    {{/if}}

    {{#if this.structuredObject.error}}
      <p role="alert">{{this.structuredObject.error.message}}</p>
    {{/if}}
  </template>
}

describe('StructuredObject', () => {
  test('renders the partial object while it arrives', async () => {
    const response = createControlledStream<string>();
    const { fetch, requests } = createFetch(() =>
      textStreamResponse(response.stream),
    );
    const options: Options = {
      api: '/api/object',
      schema,
      fetch,
      headers: { 'X-Test': 'yes' },
      credentials: 'include',
    };

    const { screen } = render(<template><ObjectDemo @options={{options}} /></template>);

    await screen.getByRole('button', { name: 'Generate' }).click();

    await expect.element(screen.getByText('Loading')).toBeInTheDocument();

    response.write('{"content": "Hel');

    await expect.element(screen.getByRole('status')).toHaveTextContent('Hel');

    response.write('lo, world."}');
    response.close();

    await expect
      .element(screen.getByRole('status'))
      .toHaveTextContent('Hello, world.');
    await expect.element(screen.getByText('Loading')).not.toBeInTheDocument();

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('/api/object');
    expect(requests[0].body).toBe('test-input');
    expect(requests[0].headers.get('X-Test')).toBe('yes');
    expect(requests[0].headers.get('Content-Type')).toBe('application/json');
    expect(requests[0].credentials).toBe('include');
  });

  test('stop aborts the request and keeps the partial object', async () => {
    const response = createControlledStream<string>();
    const { fetch, requests } = createFetch(() =>
      textStreamResponse(response.stream),
    );
    const options: Options = { api: '/api/object', schema, fetch };

    const { screen } = render(<template><ObjectDemo @options={{options}} /></template>);

    await screen.getByRole('button', { name: 'Generate' }).click();
    response.write('{"content": "Partial');

    await expect.element(screen.getByRole('status')).toHaveTextContent('Partial');

    await screen.getByRole('button', { name: 'Stop' }).click();

    await expect.element(screen.getByText('Loading')).not.toBeInTheDocument();
    await expect.element(screen.getByRole('status')).toHaveTextContent('Partial');
    expect(requests[0].signal?.aborted).toBe(true);
  });

  test('clear removes the object', async () => {
    const { fetch } = createFetch(() => textResponse(['{"content": "Done"}']));
    const options: Options = { api: '/api/object', schema, fetch };

    const { screen } = render(<template><ObjectDemo @options={{options}} /></template>);

    await screen.getByRole('button', { name: 'Generate' }).click();
    await expect.element(screen.getByRole('status')).toHaveTextContent('Done');

    await screen.getByRole('button', { name: 'Clear' }).click();
    await expect.element(screen.getByRole('status')).toHaveTextContent('');
  });

  test('shows the error of a failed request', async () => {
    const { fetch } = createFetch(
      () => new Response('Not found', { status: 404 }),
    );
    const options: Options = { api: '/api/object', schema, fetch };

    const { screen } = render(<template><ObjectDemo @options={{options}} /></template>);

    await screen.getByRole('button', { name: 'Generate' }).click();

    await expect.element(screen.getByRole('alert')).toHaveTextContent('Not found');
    await expect.element(screen.getByText('Loading')).not.toBeInTheDocument();
  });

  test('uses the fallback message for an error without a body', async () => {
    const { fetch } = createFetch(() => new Response(null, { status: 500 }));
    const options: Options = { api: '/api/object', schema, fetch };

    const { screen } = render(<template><ObjectDemo @options={{options}} /></template>);

    await screen.getByRole('button', { name: 'Generate' }).click();

    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent('Failed to fetch the response.');
  });

  test('calls onFinish with the validated object or the validation error', async () => {
    const finished: string[] = [];
    let body = '{"content": "Valid"}';
    const { fetch } = createFetch(() => textResponse([body]));
    const options: Options = {
      api: '/api/object',
      schema,
      fetch,
      onFinish: ({ object, error }) => {
        finished.push(
          object ? `object ${object.content}` : `error ${error?.name}`,
        );
      },
    };

    const { screen } = render(<template><ObjectDemo @options={{options}} /></template>);

    await screen.getByRole('button', { name: 'Generate' }).click();
    await expect.poll(() => finished).toEqual(['object Valid']);

    body = '{"other": 1}';
    await screen.getByRole('button', { name: 'Generate' }).click();
    await expect
      .poll(() => finished)
      .toEqual(['object Valid', 'error AI_TypeValidationError']);
  });

  test('a new submit ends the request before it', async () => {
    const first = createControlledStream<string>();
    const second = createControlledStream<string>();
    const streams = [first, second];
    const { fetch, requests } = createFetch(() =>
      textStreamResponse(streams[requests.length - 1].stream),
    );
    const options: Options = { api: '/api/object', schema, fetch };

    const { screen } = render(<template><ObjectDemo @options={{options}} /></template>);

    await screen.getByRole('button', { name: 'Generate' }).click();
    first.write('{"content": "First');
    await expect.element(screen.getByRole('status')).toHaveTextContent('First');

    await screen.getByRole('button', { name: 'Generate' }).click();
    second.write('{"content": "Second');
    await expect.element(screen.getByRole('status')).toHaveTextContent('Second');
    expect(requests[0].signal?.aborted).toBe(true);

    await expect.element(screen.getByText('Loading')).toBeInTheDocument();
    second.write('"}');
    second.close();
    await expect.element(screen.getByText('Loading')).not.toBeInTheDocument();
  });

  test('destroying the component aborts the request', async () => {
    const response = createControlledStream<string>();
    const { fetch, requests } = createFetch(() =>
      textStreamResponse(response.stream),
    );
    const options: Options = { api: '/api/object', schema, fetch };

    const { screen, unmount } = render(
      <template><ObjectDemo @options={{options}} /></template>,
    );

    await screen.getByRole('button', { name: 'Generate' }).click();
    response.write('{"content": "Partial');
    await expect.element(screen.getByRole('status')).toHaveTextContent('Partial');

    unmount();

    await expect.poll(() => requests[0].signal?.aborted).toBe(true);
  });
});
