import {
  createIdGenerator,
  type UserModelMessage,
} from '@ai-sdk/provider-utils';
import { InvalidArgumentError } from '../error/invalid-argument-error';

const generateSteeringId = createIdGenerator({ prefix: 'steer', size: 24 });

const steeringRunStarter = Symbol.for('vercel.ai.steering.start');

/**
 * Why a steering message was not delivered:
 *
 * - `finished`: the run ended before the message could be delivered.
 * - `stop-condition`: a stop condition ended the run.
 * - `waiting-for-tool-results`: the run ended to wait for tool results,
 *   e.g. a tool approval or a tool without an `execute` function.
 * - `aborted`: the run was aborted.
 * - `error`: the run failed.
 */
export type SteeringNotDeliveredReason =
  | 'finished'
  | 'stop-condition'
  | 'waiting-for-tool-results'
  | 'aborted'
  | 'error';

/**
 * The outcome of a steering message.
 */
export type SteeringOutcome =
  | {
      readonly type: 'delivered';

      /** The id of the steering message. */
      readonly id: string;

      /** The user message that was added to the run. */
      readonly message: UserModelMessage;

      /** The number of the step that received the message. */
      readonly stepNumber: number;
    }
  | {
      readonly type: 'not-delivered';

      /** The id of the steering message. */
      readonly id: string;

      /** The user message that was not added to the run. */
      readonly message: UserModelMessage;

      /** Why the message was not delivered. */
      readonly reason: SteeringNotDeliveredReason;
    };

/**
 * Sends user messages to a running generation. Pass it to `generateText`,
 * `streamText`, or an agent call with the `experimental_steering` option.
 */
export interface Steering {
  /**
   * Adds a user message to the run at the next step boundary, after the
   * current step and its tool calls are done. If the run would end because the
   * model finished its answer, it continues for another step unless a stop
   * condition is met.
   *
   * Messages that are sent before the run starts are delivered in the first
   * step.
   *
   * @param message - The user message, or its text.
   * @param options.id - The id of the message. Sending a message again with
   * the same id returns the outcome of the first message.
   *
   * @returns The outcome of the message. It never rejects.
   */
  steer(
    message: string | UserModelMessage,
    options?: { id?: string },
  ): Promise<SteeringOutcome>;
}

/**
 * The run side of a steering object.
 */
export type SteeringRun = {
  hasPendingMessages(): boolean;
  takeMessages(stepNumber: number): Array<UserModelMessage>;
  end(reason: SteeringNotDeliveredReason): void;
};

type PendingSteer = {
  id: string;
  message: UserModelMessage;
  resolve: (outcome: SteeringOutcome) => void;
};

class DefaultSteering implements Steering {
  private state: 'idle' | 'running' | 'ended' = 'idle';
  private activeRun: object | undefined;
  private pending: Array<PendingSteer> = [];
  private outcomes = new Map<string, Promise<SteeringOutcome>>();

  steer(
    message: string | UserModelMessage,
    options?: { id?: string },
  ): Promise<SteeringOutcome> {
    const id = options?.id ?? generateSteeringId();

    const existingOutcome = this.outcomes.get(id);
    if (existingOutcome != null) {
      return existingOutcome;
    }

    const userMessage: UserModelMessage =
      typeof message === 'string'
        ? { role: 'user', content: message }
        : message;

    if (userMessage.role !== 'user') {
      throw new InvalidArgumentError({
        parameter: 'message',
        value: message,
        message: 'Steering messages must be user messages.',
      });
    }

    const outcome =
      this.state === 'ended'
        ? Promise.resolve<SteeringOutcome>({
            type: 'not-delivered',
            id,
            message: userMessage,
            reason: 'finished',
          })
        : new Promise<SteeringOutcome>(resolve => {
            this.pending.push({ id, message: userMessage, resolve });
          });

    this.outcomes.set(id, outcome);

    return outcome;
  }

  [steeringRunStarter](): SteeringRun {
    if (this.state === 'running') {
      throw new InvalidArgumentError({
        parameter: 'experimental_steering',
        value: this,
        message: 'The steering object is already used by a running generation.',
      });
    }

    const run = {};
    this.activeRun = run;
    this.state = 'running';
    this.outcomes = new Map(
      [...this.outcomes].filter(([id]) =>
        this.pending.some(pending => pending.id === id),
      ),
    );

    // a run only changes the steering object while it is the active run:
    const isActive = () => this.activeRun === run;

    return {
      hasPendingMessages: () => isActive() && this.pending.length > 0,

      takeMessages: stepNumber => {
        if (!isActive()) {
          return [];
        }

        const delivered = this.pending;
        this.pending = [];

        for (const { id, message, resolve } of delivered) {
          resolve({ type: 'delivered', id, message, stepNumber });
        }

        return delivered.map(({ message }) => message);
      },

      end: reason => {
        if (!isActive()) {
          return;
        }

        const notDelivered = this.pending;
        this.pending = [];
        this.state = 'ended';
        this.activeRun = undefined;

        for (const { id, message, resolve } of notDelivered) {
          resolve({ type: 'not-delivered', id, message, reason });
        }
      },
    };
  }
}

/**
 * Creates a steering object that sends user messages to a running generation.
 *
 * @example
 * ```ts
 * const steering = experimental_createSteering();
 *
 * const result = streamText({
 *   model,
 *   tools,
 *   stopWhen: isStepCount(20),
 *   experimental_steering: steering,
 * });
 *
 * const outcome = await steering.steer('Use Paris, Texas instead.');
 * ```
 */
export function createSteering(): Steering {
  return new DefaultSteering();
}

/**
 * Starts a run for a steering object that was passed to a generation.
 */
export function startSteeringRun(
  steering: Steering | undefined,
): SteeringRun | undefined {
  if (steering == null) {
    return undefined;
  }

  const start = (steering as Partial<DefaultSteering>)[steeringRunStarter];

  if (typeof start !== 'function') {
    throw new InvalidArgumentError({
      parameter: 'experimental_steering',
      value: steering,
      message:
        'The steering object must be created with experimental_createSteering().',
    });
  }

  return start.call(steering);
}
