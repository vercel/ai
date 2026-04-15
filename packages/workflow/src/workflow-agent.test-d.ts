import { describe, expectTypeOf, it } from 'vitest';
import type {
  AgentOnStepStartEvent,
  AgentOnToolCallFinishEvent,
  AgentOnToolCallStartEvent,
} from 'ai';
import type {
  WorkflowAgentOnStepStartCallback,
  WorkflowAgentOnToolCallFinishCallback,
  WorkflowAgentOnToolCallStartCallback,
} from './workflow-agent';

/**
 * These tests verify that WorkflowAgent callback event shapes are
 * structurally compatible with the shared Agent callback event types
 * from the `ai` package.
 *
 * This ensures users can write callbacks that work with either
 * ToolLoopAgent or WorkflowAgent using the shared base types.
 */
describe('WorkflowAgent callback type compatibility with shared Agent types', () => {
  it('onToolCallStart event should be assignable to AgentOnToolCallStartEvent', () => {
    type WorkflowEvent = Parameters<WorkflowAgentOnToolCallStartCallback>[0];
    expectTypeOf<WorkflowEvent>().toMatchTypeOf<AgentOnToolCallStartEvent>();
  });

  it('onToolCallFinish event should be assignable to AgentOnToolCallFinishEvent', () => {
    type WorkflowEvent = Parameters<WorkflowAgentOnToolCallFinishCallback>[0];
    expectTypeOf<WorkflowEvent>().toMatchTypeOf<AgentOnToolCallFinishEvent>();
  });

  it('onStepStart event should be assignable to AgentOnStepStartEvent', () => {
    type WorkflowEvent = Parameters<WorkflowAgentOnStepStartCallback>[0];
    expectTypeOf<WorkflowEvent>().toMatchTypeOf<AgentOnStepStartEvent>();
  });
});
