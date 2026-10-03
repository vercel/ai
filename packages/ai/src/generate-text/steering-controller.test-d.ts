import type { ModelMessage } from '@ai-sdk/provider-utils';
import { describe, expectTypeOf, it } from 'vitest';
import type { AgentCallParameters, AgentStreamParameters } from '../agent';
import type { generateText } from './generate-text';
import {
  SteeringController,
  type SteeringReceipt,
  type SteeringSignal,
} from './steering-controller';
import type { streamText } from './stream-text';

describe('SteeringController types', () => {
  it('should expose signal as SteeringSignal', () => {
    const controller = new SteeringController();
    expectTypeOf(controller.signal).toEqualTypeOf<SteeringSignal>();
    expectTypeOf(controller.signal.isSteerable).toEqualTypeOf<boolean>();
  });

  it('should accept string in steer()', () => {
    const controller = new SteeringController();
    expectTypeOf(controller.steer('message')).toEqualTypeOf<
      Promise<SteeringReceipt>
    >();
  });

  it('should accept single ModelMessage in steer()', () => {
    const controller = new SteeringController();
    const modelMessage: ModelMessage = {
      role: 'user',
      content: [{ type: 'text', text: 'hello' }],
    };
    expectTypeOf(controller.steer(modelMessage)).toEqualTypeOf<
      Promise<SteeringReceipt>
    >();
  });

  it('should accept ModelMessage[] in steer()', () => {
    const controller = new SteeringController();
    const messages: ModelMessage[] = [
      {
        role: 'user',
        content: [{ type: 'text', text: 'hello' }],
      },
    ];
    expectTypeOf(controller.steer(messages)).toEqualTypeOf<
      Promise<SteeringReceipt>
    >();
  });

  it('should have stepNumber property on SteeringReceipt', () => {
    expectTypeOf<SteeringReceipt>().toEqualTypeOf<{
      readonly stepNumber: number;
    }>();
  });

  it('should accept experimental_steeringSignal in generateText parameters', () => {
    expectTypeOf<Parameters<typeof generateText>[0]>().toMatchTypeOf<{
      experimental_steeringSignal?: SteeringSignal | undefined;
    }>();
  });

  it('should accept experimental_steeringSignal in streamText parameters', () => {
    expectTypeOf<Parameters<typeof streamText>[0]>().toMatchTypeOf<{
      experimental_steeringSignal?: SteeringSignal | undefined;
    }>();
  });

  it('should accept experimental_steeringSignal in AgentCallParameters and AgentStreamParameters', () => {
    expectTypeOf<AgentCallParameters<never, {}>>().toMatchTypeOf<{
      experimental_steeringSignal?: SteeringSignal | undefined;
    }>();

    expectTypeOf<AgentStreamParameters<never, {}>>().toMatchTypeOf<{
      experimental_steeringSignal?: SteeringSignal | undefined;
    }>();
  });
});
