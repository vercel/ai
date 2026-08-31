import { describe, expect, it } from 'vitest';
import { resolveACPInstructionConfiguration } from './instruction-mapping';

describe('ACP instruction mapping', () => {
  it('merges instructions into nested session metadata', async () => {
    const result = await resolveACPInstructionConfiguration({
      instructions: 'Answer every question in German.',
      instructionMapping: {
        type: 'session-meta',
        path: ['systemPrompt', 'append'],
      },
      sessionMeta: {
        systemPrompt: { excludeDynamicSections: true },
        profile: 'default',
      },
      environment: { EXISTING: 'value' },
    });

    expect(result).toEqual({
      sessionMeta: {
        systemPrompt: {
          excludeDynamicSections: true,
          append: 'Answer every question in German.',
        },
        profile: 'default',
      },
      environment: { EXISTING: 'value' },
    });
  });

  it('merges instructions into an existing JSON launch environment', async () => {
    const result = await resolveACPInstructionConfiguration({
      instructions: 'Answer every question in German.',
      instructionMapping: {
        type: 'launch-env-json',
        variable: 'CODEX_CONFIG',
        path: ['developer_instructions'],
      },
      sessionMeta: { profile: 'default' },
      environment: {
        CODEX_CONFIG: JSON.stringify({
          model: 'openai/gpt-5.6-sol',
          model_provider: 'ai_gateway',
          developer_instructions: 'Old instructions.',
        }),
        EXISTING: 'value',
      },
    });

    expect(result.sessionMeta).toEqual({ profile: 'default' });
    expect(result.environment.EXISTING).toBe('value');
    expect(JSON.parse(result.environment.CODEX_CONFIG!)).toEqual({
      model: 'openai/gpt-5.6-sol',
      model_provider: 'ai_gateway',
      developer_instructions: 'Answer every question in German.',
    });
  });

  it('creates a JSON launch configuration when the variable is absent', async () => {
    const result = await resolveACPInstructionConfiguration({
      instructions: 'Be concise.',
      instructionMapping: {
        type: 'launch-env-json',
        variable: 'CODEX_CONFIG',
        path: ['developer_instructions'],
      },
      sessionMeta: undefined,
      environment: {},
    });

    expect(result.environment.CODEX_CONFIG).toBe(
      JSON.stringify({ developer_instructions: 'Be concise.' }),
    );
  });

  it('does not expose invalid JSON environment contents in its error', async () => {
    const secret = 'invalid-secret';
    const error = await resolveACPInstructionConfiguration({
      instructions: 'Be concise.',
      instructionMapping: {
        type: 'launch-env-json',
        variable: 'CODEX_CONFIG',
        path: ['developer_instructions'],
      },
      sessionMeta: undefined,
      environment: { CODEX_CONFIG: `{${secret}` },
    }).catch(error => error);

    expect(error).toEqual(
      new Error(
        'ACP instruction mapping environment variable "CODEX_CONFIG" must contain a JSON object.',
      ),
    );
    expect(String(error)).not.toContain(secret);
  });

  it('rejects unsafe mapping paths', async () => {
    await expect(
      resolveACPInstructionConfiguration({
        instructions: 'Be concise.',
        instructionMapping: {
          type: 'session-meta',
          path: ['__proto__', 'instructions'],
        },
        sessionMeta: undefined,
        environment: {},
      }),
    ).rejects.toThrow(
      'ACP instruction mapping path must contain only safe, non-empty property names.',
    );
  });
});
