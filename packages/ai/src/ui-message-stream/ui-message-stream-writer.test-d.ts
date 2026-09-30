import { describe, expectTypeOf, it } from 'vitest';
import type { createUIMessageStream } from './create-ui-message-stream';
import type {
  UIMessageStreamWriter,
  UIMessageStreamWriterWithOutcome,
} from './ui-message-stream-writer';

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
  });
});
