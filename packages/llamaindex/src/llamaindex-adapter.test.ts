import {
  convertArrayToAsyncIterable,
  convertReadableStreamToArray,
} from 'ai/test';
import { toUIMessageStream } from './llamaindex-adapter';
import { describe, it, expect } from 'vitest';

describe('toUIMessageStream', () => {
  it('should convert AsyncIterable<EngineResponse>', async () => {
    const inputStream = convertArrayToAsyncIterable([
      { delta: 'Hello' },
      { delta: 'World' },
    ]);

    expect(await convertReadableStreamToArray(toUIMessageStream(inputStream)))
      .toMatchInlineSnapshot(`
        [
          {
            "id": "1",
            "type": "text-start",
          },
          {
            "delta": "Hello",
            "id": "1",
            "type": "text-delta",
          },
          {
            "delta": "World",
            "id": "1",
            "type": "text-delta",
          },
          {
            "id": "1",
            "type": "text-end",
          },
        ]
      `);
  });

  it.each([
    ['spaces split across chunks', ['    ', 'return value\n']],
    ['a leading tab', ['\t', 'return value\n']],
    ['newlines split across chunks', ['\n', '\nreturn value\n']],
    ['ordinary prose', ['return value\n']],
  ])('preserves %s when trimStart is false', async (_, chunks) => {
    const expectedText = chunks.join('');
    let callbackText = '';
    let finalText = '';

    const output = await convertReadableStreamToArray(
      toUIMessageStream(
        convertArrayToAsyncIterable(chunks.map(delta => ({ delta }))),
        {
          trimStart: false,
          onText: text => {
            callbackText += text;
          },
          onFinal: text => {
            finalText = text;
          },
        },
      ),
    );

    const uiText = output
      .flatMap(chunk => (chunk.type === 'text-delta' ? [chunk.delta] : []))
      .join('');

    expect({ uiText, callbackText, finalText }).toEqual({
      uiText: expectedText,
      callbackText: expectedText,
      finalText: expectedText,
    });
  });

  it('trims leading whitespace by default', async () => {
    let callbackText = '';
    let finalText = '';

    const output = await convertReadableStreamToArray(
      toUIMessageStream(
        convertArrayToAsyncIterable([
          { delta: '    ' },
          { delta: 'return value\n' },
        ]),
        {
          onText: text => {
            callbackText += text;
          },
          onFinal: text => {
            finalText = text;
          },
        },
      ),
    );

    const uiText = output
      .flatMap(chunk => (chunk.type === 'text-delta' ? [chunk.delta] : []))
      .join('');

    expect({ uiText, callbackText, finalText }).toEqual({
      uiText: 'return value\n',
      callbackText: 'return value\n',
      finalText: 'return value\n',
    });
  });
});
