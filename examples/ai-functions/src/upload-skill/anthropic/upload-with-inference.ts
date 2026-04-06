import {
  anthropic,
  type AnthropicLanguageModelOptions,
} from '@ai-sdk/anthropic';
import { generateText, uploadSkill } from 'ai';
import { readFileSync } from 'fs';
import { run } from '../../lib/run';

async function deleteUploadedSkill({
  providerReference,
}: {
  providerReference: Record<string, string>;
}) {
  const skillId = providerReference.anthropic;
  if (skillId == null) {
    throw new Error('Missing Anthropic skill ID in providerReference.');
  }

  const headers = {
    'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
    'anthropic-version': '2023-06-01',
    'anthropic-beta': 'skills-2025-10-02',
  };

  const versionsResponse = await fetch(
    `https://api.anthropic.com/v1/skills/${skillId}/versions`,
    { headers },
  );
  if (!versionsResponse.ok) {
    const body = await versionsResponse.text();
    throw new Error(
      `Failed to list Anthropic skill versions for ${skillId}: ${versionsResponse.status} ${body}`,
    );
  }

  const versions = (await versionsResponse.json()) as {
    data?: Array<{ version: string }>;
  };

  for (const version of versions.data ?? []) {
    const deleteVersionResponse = await fetch(
      `https://api.anthropic.com/v1/skills/${skillId}/versions/${version.version}`,
      {
        method: 'DELETE',
        headers,
      },
    );
    if (!deleteVersionResponse.ok) {
      const body = await deleteVersionResponse.text();
      throw new Error(
        `Failed to delete Anthropic skill version ${version.version} for ${skillId}: ${deleteVersionResponse.status} ${body}`,
      );
    }
  }

  const deleteSkillResponse = await fetch(
    `https://api.anthropic.com/v1/skills/${skillId}`,
    {
      method: 'DELETE',
      headers,
    },
  );
  if (!deleteSkillResponse.ok) {
    const body = await deleteSkillResponse.text();
    throw new Error(
      `Failed to delete Anthropic skill ${skillId}: ${deleteSkillResponse.status} ${body}`,
    );
  }
}

run(async () => {
  const {
    providerReference,
    displayTitle,
    name,
    description,
    latestVersion,
    providerMetadata,
  } = await uploadSkill({
    api: anthropic.skills(),
    files: [
      {
        path: 'island-rescue/SKILL.md',
        content: readFileSync('data/island-rescue/SKILL.md'),
      },
    ],
    displayTitle: 'Island Rescue Test',
  });

  console.log('Provider reference:', providerReference);
  console.log('Display title:', displayTitle);
  console.log('Name:', name);
  console.log('Description:', description);
  console.log('Latest version:', latestVersion);
  console.log('Provider metadata:', providerMetadata);

  try {
    const result = await generateText({
      model: anthropic('claude-sonnet-4-5'),
      tools: {
        code_execution: anthropic.tools.codeExecution_20250825(),
      },
      prompt:
        'You are trapped and lost on a lonely island in 1895. Find a way to get rescued!',
      providerOptions: {
        anthropic: {
          container: {
            skills: [
              {
                type: 'custom',
                providerReference,
              },
            ],
          },
        } satisfies AnthropicLanguageModelOptions,
      },
    });

    console.log('Result:', result.text);
  } finally {
    try {
      await deleteUploadedSkill({ providerReference });
      console.log('Deleted uploaded Anthropic skill.');
    } catch (error) {
      console.error('Failed to delete uploaded Anthropic skill:', error);
    }
  }
});
