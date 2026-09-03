import type { AgentTool } from '@cline/agents';
import { describe, expect, it } from 'vitest';
import { createClineSkillsRuntime } from './cline-skills';

describe('createClineSkillsRuntime', () => {
  it('omits the native tool when no skills are configured', () => {
    expect(createClineSkillsRuntime({ skills: [] })).toEqual({
      signature: '[]',
    });
  });

  it('advertises and invokes skills with arguments and attached files', async () => {
    const runtime = createClineSkillsRuntime({
      skills: [
        {
          name: 'release-notes',
          description: 'Use when drafting release notes.',
          content: 'Follow the attached templates.',
          files: [
            { path: 'templates/short.md', content: '# Short' },
            { path: 'references/style.md', content: '# Style' },
          ],
        },
      ],
    });

    expect(runtime.tool?.description).toContain(
      'Available skills: release-notes.',
    );
    await expect(
      runtime.tool?.execute(
        { skill: '/RELEASE-NOTES', args: ' v2.0.0 ' },
        createToolContext(),
      ),
    ).resolves.toMatchInlineSnapshot(`
      "<command-name>release-notes</command-name>
      <command-args>v2.0.0</command-args>
      <command-instructions>
      Description: Use when drafting release notes.

      Follow the attached templates.

      <skill-files>
      <skill-file path=\"references/style.md\">
      # Style
      </skill-file>
      <skill-file path=\"templates/short.md\">
      # Short
      </skill-file>
      </skill-files>
      </command-instructions>"
    `);
  });

  it('returns a useful response for an unknown skill', async () => {
    const runtime = createClineSkillsRuntime({
      skills: [
        { name: 'alpha', description: 'Alpha.', content: 'Alpha content.' },
        { name: 'beta', description: 'Beta.', content: 'Beta content.' },
      ],
    });

    await expect(
      runtime.tool?.execute({ skill: 'missing' }, createToolContext()),
    ).resolves.toBe('Skill "missing" not found. Available skills: alpha, beta');
  });

  it('uses a deterministic signature for equivalent skill data', () => {
    const first = createClineSkillsRuntime({
      skills: [
        {
          name: 'beta',
          description: 'Beta.',
          content: 'Beta content.',
        },
        {
          name: 'alpha',
          description: 'Alpha.',
          content: 'Alpha content.',
          files: [
            { path: 'z.md', content: 'Z' },
            { path: 'a.md', content: 'A' },
          ],
        },
      ],
    });
    const reordered = createClineSkillsRuntime({
      skills: [
        {
          name: 'alpha',
          description: 'Alpha.',
          content: 'Alpha content.',
          files: [
            { path: 'a.md', content: 'A' },
            { path: 'z.md', content: 'Z' },
          ],
        },
        {
          name: 'beta',
          description: 'Beta.',
          content: 'Beta content.',
        },
      ],
    });
    const changed = createClineSkillsRuntime({
      skills: [
        {
          name: 'alpha',
          description: 'Alpha.',
          content: 'Changed content.',
          files: [
            { path: 'a.md', content: 'A' },
            { path: 'z.md', content: 'Z' },
          ],
        },
        {
          name: 'beta',
          description: 'Beta.',
          content: 'Beta content.',
        },
      ],
    });

    expect(reordered.signature).toBe(first.signature);
    expect(changed.signature).not.toBe(first.signature);
  });

  it('rejects ambiguous names and unsafe attached file paths', () => {
    expect(() =>
      createClineSkillsRuntime({
        skills: [
          { name: 'Demo', description: 'First.', content: 'First.' },
          { name: 'demo', description: 'Second.', content: 'Second.' },
        ],
      }),
    ).toThrow('Duplicate Cline skill identifier: demo');
    expect(() =>
      createClineSkillsRuntime({
        skills: [
          {
            name: 'demo',
            description: 'Demo.',
            content: 'Demo.',
            files: [{ path: '../secret.md', content: 'Secret.' }],
          },
        ],
      }),
    ).toThrow('Invalid Cline skill file path for demo: ../secret.md');
  });
});

function createToolContext(): Parameters<AgentTool['execute']>[1] {
  return {
    agentId: 'agent-1',
    runId: 'run-1',
    iteration: 1,
    toolCallId: 'tool-call-1',
  };
}
