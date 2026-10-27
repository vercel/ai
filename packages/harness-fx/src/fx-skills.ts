import type { HarnessV1Skill } from '@ai-sdk/harness';

export async function createFxSkillsRuntime({
  skills,
}: {
  skills: ReadonlyArray<HarnessV1Skill>;
}): Promise<{ instructions: string; signature: string }> {
  const packageName: string = 'libfx/skills';
  const { createSkillsAdapter } = (await import(packageName)) as {
    createSkillsAdapter(
      records: Array<{
        name: string;
        description: string;
        instructions: string;
        resources: Array<{ uri: string; text: string }>;
      }>,
    ): { instructions: string };
  };
  const { instructions } = createSkillsAdapter(
    skills.map(skill => ({
      name: skill.name,
      description: skill.description,
      instructions: skill.content,
      resources: (skill.files ?? []).map(file => ({
        uri: file.path,
        text: file.content,
      })),
    })),
  );
  return { instructions, signature: instructions };
}
