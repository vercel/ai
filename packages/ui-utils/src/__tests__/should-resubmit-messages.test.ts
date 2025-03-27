import { describe, it, expect } from 'vitest';
import {
  shouldResubmitMessages,
  isAssistantMessageWithCompletedToolCalls,
} from '../should-resubmit-messages';
import { UIMessage } from '../types';

describe('shouldResubmitMessages', () => {
  const createAssistantMessage = (
    parts: any[] = [],
    toolInvocations: any[] = [],
  ): UIMessage => ({
    id: 'test-id',
    role: 'assistant',
    createdAt: new Date(),
    parts,
    toolInvocations,
    content: '',
  });

  // Helper function to create a text part
  const createTextPart = (text: string) => ({
    type: 'text' as const,
    text,
  });

  // Helper function to create a tool invocation part
  const createToolInvocationPart = (toolInvocation: any) => ({
    type: 'tool-invocation' as const,
    toolInvocation,
  });

  // Helper function to create a tool invocation with result
  const createToolInvocationWithResult = (id: string, step: number) => ({
    id,
    step,
    input: { test: 'input' },
    result: { test: 'result' },
  });

  // Helper function to create a tool invocation without result
  const createToolInvocationWithoutResult = (id: string, step: number) => ({
    id,
    step,
    input: { test: 'input' },
  });

  describe('Feature enablement check', () => {
    it('should return false when maxSteps <= 1 (feature disabled)', () => {
      const message = createAssistantMessage(
        [createToolInvocationPart(createToolInvocationWithResult('tool1', 1))],
        [createToolInvocationWithResult('tool1', 1)],
      );

      const result = shouldResubmitMessages({
        originalMaxToolInvocationStep: 0,
        originalMessageCount: 1,
        maxSteps: 1, // Feature disabled
        messages: [message],
      });

      expect(result).toBe(false);
    });

    it('should potentially return true when maxSteps > 1 (if other conditions are met)', () => {
      const message = createAssistantMessage(
        [createToolInvocationPart(createToolInvocationWithResult('tool1', 1))],
        [createToolInvocationWithResult('tool1', 1)],
      );

      const result = shouldResubmitMessages({
        originalMaxToolInvocationStep: 0,
        originalMessageCount: 0,
        maxSteps: 2, // Feature enabled
        messages: [message],
      });

      // Other conditions are met in this test case
      expect(result).toBe(true);
    });
  });

  describe('Last message existence check', () => {
    it('should return false when messages array is empty', () => {
      const result = shouldResubmitMessages({
        originalMaxToolInvocationStep: 0,
        originalMessageCount: 0,
        maxSteps: 2,
        messages: [],
      });

      expect(result).toBe(false);
    });

    it('should potentially return true when lastMessage exists (if other conditions are met)', () => {
      const message = createAssistantMessage(
        [createToolInvocationPart(createToolInvocationWithResult('tool1', 1))],
        [createToolInvocationWithResult('tool1', 1)],
      );

      const result = shouldResubmitMessages({
        originalMaxToolInvocationStep: 0,
        originalMessageCount: 0,
        maxSteps: 2,
        messages: [message],
      });

      expect(result).toBe(true);
    });
  });

  describe('New steps check', () => {
    it('should return false when no new messages or steps are added', () => {
      const message = createAssistantMessage(
        [createToolInvocationPart(createToolInvocationWithResult('tool1', 1))],
        [createToolInvocationWithResult('tool1', 1)],
      );

      const result = shouldResubmitMessages({
        originalMaxToolInvocationStep: 1, // Same as current max step
        originalMessageCount: 1, // Same as current message count
        maxSteps: 2,
        messages: [message],
      });

      expect(result).toBe(false);
    });

    it('should return true when message count increases (if other conditions are met)', () => {
      const message = createAssistantMessage(
        [createToolInvocationPart(createToolInvocationWithResult('tool1', 1))],
        [createToolInvocationWithResult('tool1', 1)],
      );

      const result = shouldResubmitMessages({
        originalMaxToolInvocationStep: 1,
        originalMessageCount: 0, // Less than current message count (1)
        maxSteps: 2,
        messages: [message],
      });

      expect(result).toBe(true);
    });

    it('should return true when tool invocation step changes (if other conditions are met)', () => {
      const message = createAssistantMessage(
        [createToolInvocationPart(createToolInvocationWithResult('tool1', 2))],
        [createToolInvocationWithResult('tool1', 2)],
      );

      const result = shouldResubmitMessages({
        originalMaxToolInvocationStep: 1, // Different from current max step (2)
        originalMessageCount: 1, // Same as current message count
        maxSteps: 3,
        messages: [message],
      });

      expect(result).toBe(true);
    });
  });

  describe('Next step possibility check', () => {
    it('should return false when last message is not an assistant message', () => {
      const message: UIMessage = {
        id: 'test-id',
        role: 'user', // Not 'assistant'
        created: Date.now(),
        parts: [
          createToolInvocationPart(createToolInvocationWithResult('tool1', 1)),
        ],
        toolInvocations: [createToolInvocationWithResult('tool1', 1)],
      };

      const result = shouldResubmitMessages({
        originalMaxToolInvocationStep: 0,
        originalMessageCount: 0,
        maxSteps: 2,
        messages: [message],
      });

      expect(result).toBe(false);
    });

    it('should return false when assistant message has no tool invocations', () => {
      const message = createAssistantMessage(
        [createTextPart('Hello')], // No tool invocations
        [],
      );

      const result = shouldResubmitMessages({
        originalMaxToolInvocationStep: 0,
        originalMessageCount: 0,
        maxSteps: 2,
        messages: [message],
      });

      expect(result).toBe(false);
    });

    it('should return false when assistant message has incomplete tool invocations', () => {
      const message = createAssistantMessage(
        [
          createToolInvocationPart(
            createToolInvocationWithoutResult('tool1', 1),
          ),
        ], // Missing result
        [createToolInvocationWithoutResult('tool1', 1)],
      );

      const result = shouldResubmitMessages({
        originalMaxToolInvocationStep: 0,
        originalMessageCount: 0,
        maxSteps: 2,
        messages: [message],
      });

      expect(result).toBe(false);
    });

    it('should potentially return true when all tool invocations are complete (if other conditions are met)', () => {
      const message = createAssistantMessage(
        [createToolInvocationPart(createToolInvocationWithResult('tool1', 1))],
        [createToolInvocationWithResult('tool1', 1)],
      );

      const result = shouldResubmitMessages({
        originalMaxToolInvocationStep: 0,
        originalMessageCount: 0,
        maxSteps: 2,
        messages: [message],
      });

      expect(result).toBe(true);
    });
  });

  describe('Text after tool invocation check', () => {
    it('should return false when last tool invocation is followed by text', () => {
      const message = createAssistantMessage(
        [
          createToolInvocationPart(createToolInvocationWithResult('tool1', 1)),
          createTextPart('Some text after tool invocation'), // Text after tool
        ],
        [createToolInvocationWithResult('tool1', 1)],
      );

      const result = shouldResubmitMessages({
        originalMaxToolInvocationStep: 0,
        originalMessageCount: 0,
        maxSteps: 2,
        messages: [message],
      });

      expect(result).toBe(false);
    });

    it('should return true when tool invocation is the last part (if other conditions are met)', () => {
      const message = createAssistantMessage(
        [
          createTextPart('Some text before tool invocation'),
          createToolInvocationPart(createToolInvocationWithResult('tool1', 1)), // Tool is last
        ],
        [createToolInvocationWithResult('tool1', 1)],
      );

      const result = shouldResubmitMessages({
        originalMaxToolInvocationStep: 0,
        originalMessageCount: 0,
        maxSteps: 2,
        messages: [message],
      });

      expect(result).toBe(true);
    });
  });

  describe('Maximum steps limit check', () => {
    it('should return false when current step count >= maxSteps', () => {
      const message = createAssistantMessage(
        [createToolInvocationPart(createToolInvocationWithResult('tool1', 2))],
        [createToolInvocationWithResult('tool1', 2)],
      );

      const result = shouldResubmitMessages({
        originalMaxToolInvocationStep: 0,
        originalMessageCount: 0,
        maxSteps: 2, // Max is 2, current is 2
        messages: [message],
      });

      expect(result).toBe(false);
    });

    it('should return true when current step count < maxSteps (if other conditions are met)', () => {
      const message = createAssistantMessage(
        [createToolInvocationPart(createToolInvocationWithResult('tool1', 1))],
        [createToolInvocationWithResult('tool1', 1)],
      );

      const result = shouldResubmitMessages({
        originalMaxToolInvocationStep: 0,
        originalMessageCount: 0,
        maxSteps: 3, // Max is 3, current is 1
        messages: [message],
      });

      expect(result).toBe(true);
    });
  });

  describe('Combined scenarios', () => {
    it('should return true when all conditions are satisfied', () => {
      const message = createAssistantMessage(
        [createToolInvocationPart(createToolInvocationWithResult('tool1', 1))],
        [createToolInvocationWithResult('tool1', 1)],
      );

      const result = shouldResubmitMessages({
        originalMaxToolInvocationStep: 0,
        originalMessageCount: 0,
        maxSteps: 3,
        messages: [message],
      });

      expect(result).toBe(true);
    });

    it('should return false if any condition fails', () => {
      // Example: Feature disabled (maxSteps <= 1)
      const message = createAssistantMessage(
        [createToolInvocationPart(createToolInvocationWithResult('tool1', 1))],
        [createToolInvocationWithResult('tool1', 1)],
      );

      const result = shouldResubmitMessages({
        originalMaxToolInvocationStep: 0,
        originalMessageCount: 0,
        maxSteps: 1, // Feature disabled
        messages: [message],
      });

      expect(result).toBe(false);
    });
  });

  // Testing the helper function isAssistantMessageWithCompletedToolCalls
  describe('isAssistantMessageWithCompletedToolCalls', () => {
    it('should return false for non-assistant messages', () => {
      const message: UIMessage = {
        id: 'test-id',
        role: 'user',
        created: Date.now(),
        parts: [
          createToolInvocationPart(createToolInvocationWithResult('tool1', 1)),
        ],
        toolInvocations: [],
      };

      expect(isAssistantMessageWithCompletedToolCalls(message)).toBe(false);
    });

    it('should return false for assistant messages without tool invocations', () => {
      const message = createAssistantMessage([createTextPart('Hello')], []);

      expect(isAssistantMessageWithCompletedToolCalls(message)).toBe(false);
    });

    it('should return false for assistant messages with incomplete tool invocations', () => {
      const message = createAssistantMessage(
        [
          createToolInvocationPart(
            createToolInvocationWithoutResult('tool1', 1),
          ),
        ],
        [createToolInvocationWithoutResult('tool1', 1)],
      );

      expect(isAssistantMessageWithCompletedToolCalls(message)).toBe(false);
    });

    it('should return true for assistant messages with completed tool invocations', () => {
      const message = createAssistantMessage(
        [createToolInvocationPart(createToolInvocationWithResult('tool1', 1))],
        [createToolInvocationWithResult('tool1', 1)],
      );

      expect(isAssistantMessageWithCompletedToolCalls(message)).toBe(true);
    });
  });
});
