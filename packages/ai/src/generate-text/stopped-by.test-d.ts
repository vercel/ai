import { describe, expectTypeOf, it } from 'vitest';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { generateText, streamText, type StoppedBy } from '../index';

describe('stoppedBy', () => {
  it('is typed on generateText results', async () => {
    const result = await generateText({
      model: new MockLanguageModelV4(),
      prompt: 'Hello',
    });

    expectTypeOf(result.stoppedBy).toEqualTypeOf<StoppedBy | undefined>();
  });

  it('is typed on streamText results, onEnd, and the finish part', async () => {
    const result = streamText({
      model: new MockLanguageModelV4(),
      prompt: 'Hello',
      onEnd: event => {
        expectTypeOf(event.stoppedBy).toEqualTypeOf<StoppedBy | undefined>();
      },
    });

    expectTypeOf(await result.stoppedBy).toEqualTypeOf<StoppedBy | undefined>();

    for await (const part of result.fullStream) {
      if (part.type === 'finish') {
        expectTypeOf(part.stoppedBy).toEqualTypeOf<StoppedBy | undefined>();
      }
    }
  });

  it('has the four loop exits', () => {
    expectTypeOf<StoppedBy>().toEqualTypeOf<
      'model' | 'stop-condition' | 'tool-without-execute' | 'approval'
    >();
  });
});
