import { describe, expect, it } from 'vitest';
import { convertArrayToReadableStream } from '../../test';
import { smoothStream } from './smooth-stream';

describe('smoothStream', () => {
  it('should combine partial words', async () => {
    const events: any[] = [];

    const stream = convertArrayToReadableStream([
      { textDelta: 'Hello', type: 'text-delta' },
      { textDelta: ', ', type: 'text-delta' },
      { textDelta: 'world!', type: 'text-delta' },
      { type: 'step-finish' },
      { type: 'finish' },
    ]).pipeThrough(
      smoothStream({
        delayInMs: 10,
        _internal: {
          delay: () => {
            events.push('delay');
            return Promise.resolve();
          },
        },
      })({ tools: {} }),
    );

    // Get a reader and read chunks
    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      events.push(value);
    }

    expect(events).toEqual([
      'delay',
      {
        textDelta: 'Hello, ',
        type: 'text-delta',
      },
      {
        textDelta: 'world!',
        type: 'text-delta',
      },
      {
        type: 'step-finish',
      },
      {
        type: 'finish',
      },
    ]);
  });

  it('should split larger text chunks', async () => {
    const events: any[] = [];

    const stream = convertArrayToReadableStream([
      {
        textDelta: 'Hello, World! This is an example text.',
        type: 'text-delta',
      },
      { type: 'step-finish' },
      { type: 'finish' },
    ]).pipeThrough(
      smoothStream({
        delayInMs: 10,
        _internal: {
          delay: () => {
            events.push('delay');
            return Promise.resolve();
          },
        },
      })({ tools: {} }),
    );

    // Get a reader and read chunks
    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      events.push(value);
    }

    expect(events).toEqual([
      'delay',
      {
        textDelta: 'Hello, ',
        type: 'text-delta',
      },
      'delay',
      {
        textDelta: 'World! ',
        type: 'text-delta',
      },
      'delay',
      {
        textDelta: 'This ',
        type: 'text-delta',
      },
      'delay',
      {
        textDelta: 'is ',
        type: 'text-delta',
      },
      'delay',
      {
        textDelta: 'an ',
        type: 'text-delta',
      },
      'delay',
      {
        textDelta: 'example ',
        type: 'text-delta',
      },
      {
        textDelta: 'text.',
        type: 'text-delta',
      },
      {
        type: 'step-finish',
      },
      {
        type: 'finish',
      },
    ]);
  });

  it('should keep longer whitespace sequences together', async () => {
    const events: any[] = [];

    const stream = convertArrayToReadableStream([
      { textDelta: 'First line', type: 'text-delta' },
      { textDelta: ' \n\n', type: 'text-delta' },
      { textDelta: '  ', type: 'text-delta' },
      { textDelta: '  Multiple spaces', type: 'text-delta' },
      { textDelta: '\n    Indented', type: 'text-delta' },
      { type: 'step-finish' },
      { type: 'finish' },
    ]).pipeThrough(
      smoothStream({
        delayInMs: 10,
        _internal: {
          delay: () => {
            events.push('delay');
            return Promise.resolve();
          },
        },
      })({ tools: {} }),
    );

    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      events.push(value);
    }

    expect(events).toEqual([
      'delay',
      {
        textDelta: 'First ',
        type: 'text-delta',
      },
      'delay',
      {
        textDelta: 'line \n\n',
        type: 'text-delta',
      },
      'delay',
      {
        // note: leading whitespace is included here
        // because it is part of the new chunk:
        textDelta: '    Multiple ',
        type: 'text-delta',
      },
      'delay',
      {
        textDelta: 'spaces\n    ',
        type: 'text-delta',
      },
      {
        textDelta: 'Indented',
        type: 'text-delta',
      },
      {
        type: 'step-finish',
      },
      {
        type: 'finish',
      },
    ]);
  });

  it('should split text by lines when using line chunking mode', async () => {
    const events: any[] = [];

    const stream = convertArrayToReadableStream([
      {
        textDelta: 'First line\nSecond line\nThird line with more text\n',
        type: 'text-delta',
      },
      { textDelta: 'Partial line', type: 'text-delta' },
      { textDelta: ' continues\nFinal line\n', type: 'text-delta' },
      { type: 'step-finish' },
      { type: 'finish' },
    ]).pipeThrough(
      smoothStream({
        delayInMs: 10,
        chunking: 'line',
        _internal: {
          delay: () => {
            events.push('delay');
            return Promise.resolve();
          },
        },
      })({ tools: {} }),
    );

    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      events.push(value);
    }

    expect(events).toEqual([
      'delay',
      {
        textDelta: 'First line\n',
        type: 'text-delta',
      },
      'delay',
      {
        textDelta: 'Second line\n',
        type: 'text-delta',
      },
      'delay',
      {
        textDelta: 'Third line with more text\n',
        type: 'text-delta',
      },
      'delay',
      {
        textDelta: 'Partial line continues\n',
        type: 'text-delta',
      },
      'delay',
      {
        textDelta: 'Final line\n',
        type: 'text-delta',
      },
      {
        type: 'step-finish',
      },
      {
        type: 'finish',
      },
    ]);
  });

  it('should handle text without line endings in line chunking mode', async () => {
    const events: any[] = [];

    const stream = convertArrayToReadableStream([
      { textDelta: 'Text without', type: 'text-delta' },
      { textDelta: ' any line', type: 'text-delta' },
      { textDelta: ' breaks', type: 'text-delta' },
      { type: 'step-finish' },
      { type: 'finish' },
    ]).pipeThrough(
      smoothStream({
        delayInMs: 10,
        chunking: 'line',
        _internal: {
          delay: () => {
            events.push('delay');
            return Promise.resolve();
          },
        },
      })({ tools: {} }),
    );

    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      events.push(value);
    }

    expect(events).toEqual([
      {
        textDelta: 'Text without any line breaks',
        type: 'text-delta',
      },
      {
        type: 'step-finish',
      },
      {
        type: 'finish',
      },
    ]);
  });
});
