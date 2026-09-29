import { describe, expectTypeOf, it } from 'vitest';
import type { createUIMessageStream } from './create-ui-message-stream';
import type { UIMessageStreamOnEndCallback } from './ui-message-stream-on-end-callback';
import type {
  UIMessageStreamWriter,
  UIMessageStreamWriterWithOutcome,
} from './ui-message-stream-writer';
import type { UIMessageStreamOutcome } from './ui-message-stream-outcome';

describe('UIMessageStreamWriter', () => {
  it('keeps existing structural implementations assignable', () => {
    type ExistingWriter = {
      write: UIMessageStreamWriter['write'];
      merge: UIMessageStreamWriter['merge'];
      onError: UIMessageStreamWriter['onError'];
    };

    expectTypeOf<ExistingWriter>().toMatchTypeOf<UIMessageStreamWriter>();
  });

  it('provides setOutcome to createUIMessageStream execute callbacks', () => {
    type ExecuteWriter = Parameters<
      Parameters<typeof createUIMessageStream>[0]['execute']
    >[0]['writer'];

    expectTypeOf<ExecuteWriter>().toMatchTypeOf<UIMessageStreamWriterWithOutcome>();
    expectTypeOf<ExecuteWriter['setOutcome']>().toBeFunction();
    expectTypeOf<UIMessageStreamOutcome['status']>().toEqualTypeOf<
      'completed' | 'failed' | 'aborted' | 'unknown'
    >();
  });

  it('adds consumer cancellation without expanding the outcome union', () => {
    type EndEvent = Parameters<UIMessageStreamOnEndCallback<any>>[0];

    expectTypeOf<EndEvent['isCancelled']>().toEqualTypeOf<true | undefined>();
  });
});
