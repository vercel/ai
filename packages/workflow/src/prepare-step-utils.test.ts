import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import {
  applyPrepareStepResult,
  filterToolsByActiveTools,
  getErrorMessage,
} from './prepare-step-utils.js';

describe('applyPrepareStepResult', () => {
  const createMockPrompt = (): LanguageModelV4Prompt => [
    { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
  ];

  it('returns empty result for empty prepareResult', () => {
    const result = applyPrepareStepResult({}, createMockPrompt());
    expect(result.model).toBeUndefined();
    expect(result.messages).toBeUndefined();
    expect(result.context).toBeUndefined();
    expect(result.activeTools).toBeUndefined();
    expect(result.toolChoice).toBeUndefined();
    expect(Object.keys(result.generationSettings)).toHaveLength(0);
  });

  it('applies model override', () => {
    const mockModel = { provider: 'test', modelId: 'test-model' } as any;
    const result = applyPrepareStepResult(
      { model: mockModel },
      createMockPrompt(),
    );
    expect(result.model).toBe(mockModel);
  });

  it('applies messages override', () => {
    const newMessages: LanguageModelV4Prompt = [
      { role: 'user', content: [{ type: 'text', text: 'New message' }] },
    ];
    const result = applyPrepareStepResult(
      { messages: newMessages },
      createMockPrompt(),
    );
    expect(result.messages).toEqual(newMessages);
  });

  it('prepends system message to prompt without one', () => {
    const prompt = createMockPrompt();
    const result = applyPrepareStepResult(
      { system: 'You are a helper' },
      prompt,
    );
    expect(result.messages).toHaveLength(2);
    expect(result.messages![0]).toEqual({
      role: 'system',
      content: 'You are a helper',
    });
  });

  it('replaces existing system message in prompt', () => {
    const promptWithSystem: LanguageModelV4Prompt = [
      { role: 'system', content: 'Old system' },
      { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
    ];
    const result = applyPrepareStepResult(
      { system: 'New system' },
      promptWithSystem,
    );
    expect(result.messages).toHaveLength(2);
    expect(result.messages![0]).toEqual({
      role: 'system',
      content: 'New system',
    });
  });

  it('applies system after messages override', () => {
    const newMessages: LanguageModelV4Prompt = [
      { role: 'user', content: [{ type: 'text', text: 'New' }] },
    ];
    const result = applyPrepareStepResult(
      { messages: newMessages, system: 'System' },
      createMockPrompt(),
    );
    expect(result.messages).toHaveLength(2);
    expect(result.messages![0].role).toBe('system');
  });

  it('applies context override', () => {
    const context = { userId: '123' };
    const result = applyPrepareStepResult(
      { experimental_context: context },
      createMockPrompt(),
    );
    expect(result.context).toBe(context);
  });

  it('applies activeTools override', () => {
    const result = applyPrepareStepResult(
      { activeTools: ['tool1', 'tool2'] },
      createMockPrompt(),
    );
    expect(result.activeTools).toEqual(['tool1', 'tool2']);
  });

  it('applies toolChoice override', () => {
    const result = applyPrepareStepResult(
      { toolChoice: 'auto' },
      createMockPrompt(),
    );
    expect(result.toolChoice).toBe('auto');
  });

  it('merges generation settings', () => {
    const result = applyPrepareStepResult(
      {
        maxOutputTokens: 1000,
        temperature: 0.7,
        topP: 0.9,
        seed: 42,
      },
      createMockPrompt(),
    );
    expect(result.generationSettings).toEqual({
      maxOutputTokens: 1000,
      temperature: 0.7,
      topP: 0.9,
      seed: 42,
    });
  });

  it('applies all settings together', () => {
    const mockModel = { provider: 'test', modelId: 'test' } as any;
    const result = applyPrepareStepResult(
      {
        model: mockModel,
        system: 'Helper',
        experimental_context: { key: 'value' },
        activeTools: ['tool1'],
        toolChoice: 'required',
        temperature: 0.5,
      },
      createMockPrompt(),
    );

    expect(result.model).toBe(mockModel);
    expect(result.messages![0].role).toBe('system');
    expect(result.context).toEqual({ key: 'value' });
    expect(result.activeTools).toEqual(['tool1']);
    expect(result.toolChoice).toBe('required');
    expect(result.generationSettings.temperature).toBe(0.5);
  });
});

describe('filterToolsByActiveTools', () => {
  const mockTools = {
    tool1: { description: 'Tool 1' },
    tool2: { description: 'Tool 2' },
    tool3: { description: 'Tool 3' },
  } as any;

  it('returns all tools when activeTools is empty', () => {
    const result = filterToolsByActiveTools(mockTools, []);
    expect(result).toBe(mockTools);
  });

  it('filters tools by activeTools list', () => {
    const result = filterToolsByActiveTools(mockTools, ['tool1', 'tool3']);
    expect(Object.keys(result)).toEqual(['tool1', 'tool3']);
  });

  it('returns empty object when no tools match', () => {
    const result = filterToolsByActiveTools(mockTools, ['nonexistent']);
    expect(Object.keys(result)).toHaveLength(0);
  });
});

describe('getErrorMessage', () => {
  it('returns "unknown error" for null', () => {
    expect(getErrorMessage(null)).toBe('unknown error');
  });

  it('returns "unknown error" for undefined', () => {
    expect(getErrorMessage(undefined)).toBe('unknown error');
  });

  it('returns string directly', () => {
    expect(getErrorMessage('Something went wrong')).toBe(
      'Something went wrong',
    );
  });

  it('returns message from Error object', () => {
    expect(getErrorMessage(new Error('Test error'))).toBe('Test error');
  });

  it('returns JSON for other objects', () => {
    expect(getErrorMessage({ code: 500 })).toBe('{"code":500}');
  });
});
