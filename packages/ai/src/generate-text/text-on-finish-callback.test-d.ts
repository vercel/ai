import { describe, expectTypeOf, it } from 'vitest';
import { GenerateTextOnFinishCallback } from './generate-text';
import { StreamTextOnFinishCallback } from './stream-text';
import {
  TextOnFinishCallback,
  TextOnFinishEvent,
} from './text-on-finish-callback';
import { ToolSet } from './tool-set';
import { ToolLoopAgentOnFinishCallback } from '../agent/tool-loop-agent-on-finish-callback';

describe('TextOnFinishCallback types', () => {
  it('GenerateTextOnFinishCallback should be assignable to TextOnFinishCallback', () => {
    type Tools = ToolSet;
    expectTypeOf<GenerateTextOnFinishCallback<Tools>>().toMatchTypeOf<
      TextOnFinishCallback<Tools>
    >();
  });

  it('StreamTextOnFinishCallback should be assignable to TextOnFinishCallback', () => {
    type Tools = ToolSet;
    expectTypeOf<StreamTextOnFinishCallback<Tools>>().toMatchTypeOf<
      TextOnFinishCallback<Tools>
    >();
  });

  it('ToolLoopAgentOnFinishCallback should be assignable to TextOnFinishCallback', () => {
    type Tools = ToolSet;
    expectTypeOf<ToolLoopAgentOnFinishCallback<Tools>>().toMatchTypeOf<
      TextOnFinishCallback<Tools>
    >();
  });

  it('TextOnFinishEvent should have required experimental_context', () => {
    type Tools = ToolSet;
    type EventContext = TextOnFinishEvent<Tools>['experimental_context'];
    expectTypeOf<EventContext>().toEqualTypeOf<unknown>();
  });

  it('callback types should be interchangeable', () => {
    type Tools = ToolSet;
    const generateCallback: GenerateTextOnFinishCallback<Tools> = () => {};
    const streamCallback: StreamTextOnFinishCallback<Tools> = () => {};
    const agentCallback: ToolLoopAgentOnFinishCallback<Tools> = () => {};

    // All should be assignable to the base type
    const base1: TextOnFinishCallback<Tools> = generateCallback;
    const base2: TextOnFinishCallback<Tools> = streamCallback;
    const base3: TextOnFinishCallback<Tools> = agentCallback;

    // Suppress unused variable warnings
    void base1;
    void base2;
    void base3;
  });
});
