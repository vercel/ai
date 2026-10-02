import type { ModelMessage } from '@ai-sdk/provider-utils';
import {
  SteeringClosedError,
  SteeringNotActiveError,
  SteeringSignalAlreadyBoundError,
} from '../error';

/**
 * Receipt returned when a mid-turn steering message is accepted into an execution step.
 *
 * @experimental
 */
export type SteeringReceipt = {
  /**
   * The 0-based step number that consumed and incorporated this steering message.
   */
  readonly stepNumber: number;
};

const internalSteeringSignalSymbol = Symbol.for(
  'vercel.ai.internalSteeringSignal',
);

/**
 * Opaque signal consumed by generateText, streamText, or Agent calls.
 *
 * @experimental
 */
export interface SteeringSignal {
  /** @internal */
  readonly _brand: 'SteeringSignal';

  /**
   * Whether the signal is currently attached to an active execution that can accept steering.
   */
  readonly isSteerable: boolean;
}

export type SteeringQueueItem = {
  messages: ModelMessage[];
  resolve: (receipt: SteeringReceipt) => void;
  reject: (error: unknown) => void;
};

/**
 * Internal interface used by execution loops (generateText, streamText) to interact with a SteeringSignal.
 *
 * @internal
 */
export interface InternalSteeringSignal extends SteeringSignal {
  [internalSteeringSignalSymbol]: true;
  bind(executionId: string, abortSignal?: AbortSignal): void;
  drain(): SteeringQueueItem[];
  seal(): void;
  complete(): void;
  abort(error?: unknown): void;
}

export function isInternalSteeringSignal(
  value: unknown,
): value is InternalSteeringSignal {
  return (
    typeof value === 'object' &&
    value !== null &&
    internalSteeringSignalSymbol in value
  );
}

export function asInternalSteeringSignal(
  signal: SteeringSignal | undefined,
): InternalSteeringSignal | undefined {
  return isInternalSteeringSignal(signal) ? signal : undefined;
}

type SteeringState =
  | 'unbound'
  | 'active'
  | 'finalizing'
  | 'completed'
  | 'aborted';

class DefaultSteeringSignal implements InternalSteeringSignal {
  readonly _brand = 'SteeringSignal' as const;
  readonly [internalSteeringSignalSymbol] = true;

  private state: SteeringState = 'unbound';
  private queue: SteeringQueueItem[] = [];
  private abortReason: unknown = undefined;
  private abortListener?: () => void;
  private boundAbortSignal?: AbortSignal;

  get isSteerable(): boolean {
    return this.state === 'active';
  }

  bind(executionId: string, abortSignal?: AbortSignal): void {
    if (this.state !== 'unbound') {
      throw new SteeringSignalAlreadyBoundError();
    }

    this.state = 'active';

    if (abortSignal != null) {
      this.boundAbortSignal = abortSignal;
      if (abortSignal.aborted) {
        this.abort(abortSignal.reason);
        return;
      }

      this.abortListener = () => {
        this.abort(abortSignal.reason);
      };

      abortSignal.addEventListener('abort', this.abortListener, { once: true });
    }
  }

  steer(
    message: string | ModelMessage | ModelMessage[],
  ): Promise<SteeringReceipt> {
    if (this.state === 'unbound') {
      return Promise.reject(new SteeringNotActiveError());
    }

    if (this.state === 'finalizing' || this.state === 'completed') {
      return Promise.reject(new SteeringClosedError());
    }

    if (this.state === 'aborted') {
      const error =
        this.abortReason ?? new DOMException('Execution aborted', 'AbortError');
      return Promise.reject(error);
    }

    const messages: ModelMessage[] =
      typeof message === 'string'
        ? [{ role: 'user', content: [{ type: 'text', text: message }] }]
        : Array.isArray(message)
          ? message
          : [message];

    return new Promise<SteeringReceipt>((resolve, reject) => {
      this.queue.push({
        messages,
        resolve,
        reject,
      });
    });
  }

  drain(): SteeringQueueItem[] {
    if (this.state !== 'active') {
      return [];
    }

    const items = this.queue;
    this.queue = [];
    return items;
  }

  seal(): void {
    if (this.state === 'active') {
      this.state = 'finalizing';
    }

    for (const item of this.queue) {
      item.reject(new SteeringClosedError());
    }
    this.queue = [];
  }

  complete(): void {
    this.cleanupAbortListener();

    if (this.state === 'active' || this.state === 'finalizing') {
      this.state = 'completed';
    }

    for (const item of this.queue) {
      item.reject(new SteeringClosedError());
    }
    this.queue = [];
  }

  abort(error?: unknown): void {
    this.cleanupAbortListener();

    if (this.state === 'completed' || this.state === 'aborted') {
      return;
    }

    this.state = 'aborted';
    this.abortReason =
      error ?? new DOMException('Execution aborted', 'AbortError');

    for (const item of this.queue) {
      item.reject(this.abortReason);
    }
    this.queue = [];
  }

  private cleanupAbortListener(): void {
    if (this.boundAbortSignal != null && this.abortListener != null) {
      this.boundAbortSignal.removeEventListener('abort', this.abortListener);
      this.abortListener = undefined;
      this.boundAbortSignal = undefined;
    }
  }
}

/**
 * Controller for injecting messages into an active execution turn.
 * Follows the AbortController / AbortSignal pattern: instantiated externally,
 * and passes signal to generateText, streamText, or Agent options.
 *
 * @experimental
 */
export class SteeringController {
  private readonly _signal = new DefaultSteeringSignal();

  /**
   * The opaque steering signal to pass to generateText, streamText, or Agent options.
   */
  get signal(): SteeringSignal {
    return this._signal;
  }

  /**
   * Inject a user message into the active execution turn.
   *
   * @param message A string (wrapped as user text) or ModelMessage array to inject.
   * @returns A promise that resolves with a SteeringReceipt when the message is
   *          consumed by the next step, or rejects if steering cannot be accepted.
   */
  steer(
    message: string | ModelMessage | ModelMessage[],
  ): Promise<SteeringReceipt> {
    return this._signal.steer(message);
  }
}
