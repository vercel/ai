import { HANGING_STREAM_WARNING_TIME_MS } from './../util/constants';
import { InternalStreamableUIClient } from './rsc-shared.mjs';
import { createStreamableValue } from './streamable-value/create-streamable-value';

// It's necessary to define the type manually here, otherwise TypeScript compiler
// will not be able to infer the correct return type as it's circular.
type StreamableUIWrapper = {
  /**
   * The value of the streamable UI. This can be returned from a Server Action and received by the client.
   */
  readonly value: React.ReactNode;

  /**
   * This method updates the current UI node. It takes a new UI node and replaces the old one.
   */
  update(value: React.ReactNode): StreamableUIWrapper;

  /**
   * This method is used to append a new UI node to the end of the old one.
   * Once appended a new UI node, the previous UI node cannot be updated anymore.
   *
   * @example
   * ```jsx
   * const ui = createStreamableUI(<div>hello</div>)
   * ui.append(<div>world</div>)
   *
   * // The UI node will be:
   * // <>
   * //   <div>hello</div>
   * //   <div>world</div>
   * // </>
   * ```
   */
  append(value: React.ReactNode): StreamableUIWrapper;

  /**
   * This method is used to signal that there is an error in the UI stream.
   * It will be thrown on the client side and caught by the nearest error boundary component.
   */
  error(error: any): StreamableUIWrapper;

  /**
   * This method marks the UI node as finalized. You can either call it without any parameters or with a new UI node as the final state.
   * Once called, the UI node cannot be updated or appended anymore.
   *
   * This method is always **required** to be called, otherwise the response will be stuck in a loading state.
   */
  done(...args: [React.ReactNode] | []): StreamableUIWrapper;
};

/**
 * Create a piece of changeable UI that can be streamed to the client.
 * On the client side, it can be rendered as a normal React node.
 */
function createStreamableUI(initialValue?: React.ReactNode) {
  const innerStreamable = createStreamableValue<React.ReactNode>(initialValue);
  let closed = false;

  function assertStream(method: string) {
    if (closed) {
      throw new Error(method + ': UI stream is already closed.');
    }
  }

  let warningTimeout: NodeJS.Timeout | undefined;
  function warnUnclosedStream() {
    if (process.env.NODE_ENV === 'development') {
      if (warningTimeout) {
        clearTimeout(warningTimeout);
      }
      warningTimeout = setTimeout(() => {
        console.warn(
          'The streamable UI has been slow to update. This may be a bug or a performance issue or you forgot to call `.done()`.',
        );
      }, HANGING_STREAM_WARNING_TIME_MS);
    }
  }
  warnUnclosedStream();

  const streamable: StreamableUIWrapper = {
    value: <InternalStreamableUIClient s={innerStreamable.value} />,
    update(value: React.ReactNode) {
      assertStream('.update()');

      innerStreamable.update(value);
      warnUnclosedStream();

      return streamable;
    },
    append(value: React.ReactNode) {
      assertStream('.append()');

      innerStreamable.append(value);
      warnUnclosedStream();

      return streamable;
    },
    error(error: any) {
      assertStream('.error()');

      if (warningTimeout) {
        clearTimeout(warningTimeout);
      }
      closed = true;
      innerStreamable.error(error);

      return streamable;
    },
    done(...args: [] | [React.ReactNode]) {
      assertStream('.done()');

      if (warningTimeout) {
        clearTimeout(warningTimeout);
      }
      closed = true;
      if (args.length) {
        innerStreamable.done(args[0]);
        return streamable;
      }

      innerStreamable.done();
      return streamable;
    },
  };

  return streamable;
}

export { createStreamableUI };
