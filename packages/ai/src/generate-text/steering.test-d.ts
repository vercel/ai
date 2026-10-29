import type { UserModelMessage } from '@ai-sdk/provider-utils';
import { describe, expectTypeOf, it } from 'vitest';
import { ToolLoopAgent } from '../agent/tool-loop-agent';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { generateText } from './generate-text';
import type { StepResult } from './step-result';
import {
  createSteering,
  type SteeringNotDeliveredReason,
  type SteeringOutcome,
} from './steering';
import { streamText } from './stream-text';

describe('steering types', () => {
  it('should accept text and user messages', () => {
    const steering = createSteering();

    expectTypeOf(steering.steer('hello')).toEqualTypeOf<
      Promise<SteeringOutcome>
    >();
    steering.steer({ role: 'user', content: 'hello' }, { id: 'steer-1' });

    // @ts-expect-error only user messages can be sent
    steering.steer({ role: 'assistant', content: 'hello' });
  });

  it('should narrow the outcome by type', async () => {
    const outcome = await createSteering().steer('hello');

    if (outcome.type === 'delivered') {
      expectTypeOf(outcome.stepNumber).toEqualTypeOf<number>();
    } else {
      expectTypeOf(outcome.reason).toEqualTypeOf<SteeringNotDeliveredReason>();
    }

    expectTypeOf(outcome.message).toEqualTypeOf<UserModelMessage>();
  });

  it('should expose steering messages on step results', () => {
    expectTypeOf<
      StepResult<{}>['experimental_steeringMessages']
    >().toEqualTypeOf<Array<UserModelMessage> | undefined>();
  });

  it('should pass steering messages to prepareStep', () => {
    generateText({
      model: new MockLanguageModelV4(),
      prompt: 'hello',
      prepareStep: ({ experimental_steeringMessages }) => {
        expectTypeOf(experimental_steeringMessages).toEqualTypeOf<
          Array<UserModelMessage> | undefined
        >();
        return undefined;
      },
    });
  });

  it('should accept a steering object in generateText, streamText and agents', () => {
    const steering = createSteering();
    const model = new MockLanguageModelV4();

    generateText({ model, prompt: 'hello', experimental_steering: steering });
    streamText({ model, prompt: 'hello', experimental_steering: steering });

    const agent = new ToolLoopAgent({ model });
    agent.generate({ prompt: 'hello', experimental_steering: steering });
    agent.stream({ prompt: 'hello', experimental_steering: steering });
  });
});
