import { createOpenAI } from '@ai-sdk/openai';
import { customProvider, uploadFile, uploadSkill, wrapProvider } from 'ai';
import assert from 'node:assert/strict';

type Outcome<T> =
  | { status: 'fulfilled'; value: T }
  | { status: 'rejected'; error: unknown };

async function capture<T>(operation: () => Promise<T>): Promise<Outcome<T>> {
  try {
    return { status: 'fulfilled', value: await operation() };
  } catch (error) {
    return { status: 'rejected', error };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main() {
  const provider = customProvider({
    files: {
      specificationVersion: 'v4',
      provider: 'example',
      uploadFile: async () => ({
        providerReference: { example: 'file-synthetic' },
        warnings: [],
      }),
    },
    skills: {
      specificationVersion: 'v4',
      provider: 'example',
      uploadSkill: async () => ({
        providerReference: { example: 'skill-synthetic' },
        warnings: [],
      }),
    },
  });

  const fallbackProvider = customProvider({ fallbackProvider: provider });
  const providerWithoutUploads = customProvider({});

  const directFile = await uploadFile({
    api: provider,
    data: { type: 'text', text: 'Synthetic example.' },
  });
  assert.deepEqual(directFile.providerReference, {
    example: 'file-synthetic',
  });

  const directSkill = await uploadSkill({
    api: provider,
    files: [
      {
        path: 'SKILL.md',
        data: { type: 'text', text: 'Synthetic skill.' },
      },
    ],
  });
  assert.deepEqual(directSkill.providerReference, {
    example: 'skill-synthetic',
  });

  const fallbackFile = await uploadFile({
    api: fallbackProvider,
    data: { type: 'text', text: 'Synthetic fallback example.' },
  });
  assert.deepEqual(fallbackFile.providerReference, {
    example: 'file-synthetic',
  });

  const fallbackSkill = await uploadSkill({
    api: fallbackProvider,
    files: [
      {
        path: 'SKILL.md',
        data: { type: 'text', text: 'Synthetic fallback skill.' },
      },
    ],
  });
  assert.deepEqual(fallbackSkill.providerReference, {
    example: 'skill-synthetic',
  });

  await assert.rejects(
    uploadFile({
      api: providerWithoutUploads,
      data: { type: 'text', text: 'Unsupported file.' },
    }),
    {
      message:
        'The provider does not support file uploads. Make sure it exposes a files() method.',
    },
  );
  await assert.rejects(
    uploadSkill({
      api: providerWithoutUploads,
      files: [
        {
          path: 'SKILL.md',
          data: { type: 'text', text: 'Unsupported skill.' },
        },
      ],
    }),
    {
      message:
        'The provider does not support skills. Make sure it exposes a skills() method.',
    },
  );

  console.log('six controls passed');

  const wrapped = wrapProvider({
    provider,
    languageModelMiddleware: { specificationVersion: 'v4' },
  });

  const wrappedFile = await capture(() =>
    uploadFile({
      api: wrapped,
      data: { type: 'text', text: 'Synthetic wrapped example.' },
    }),
  );
  const wrappedSkill = await capture(() =>
    uploadSkill({
      api: wrapped,
      files: [
        {
          path: 'SKILL.md',
          data: { type: 'text', text: 'Synthetic wrapped skill.' },
        },
      ],
    }),
  );

  console.log(
    'wrapped file:',
    wrappedFile.status === 'fulfilled'
      ? wrappedFile.value.providerReference
      : errorMessage(wrappedFile.error),
  );
  console.log(
    'wrapped skill:',
    wrappedSkill.status === 'fulfilled'
      ? wrappedSkill.value.providerReference
      : errorMessage(wrappedSkill.error),
  );

  const openai = createOpenAI({ apiKey: 'not-used' });
  const wrappedOpenAI = wrapProvider({
    provider: openai,
    languageModelMiddleware: { specificationVersion: 'v4' },
  });
  console.log('original OpenAI upload methods:', {
    files: typeof openai.files,
    skills: typeof openai.skills,
  });
  console.log('wrapped OpenAI upload methods:', {
    files: typeof wrappedOpenAI.files,
    skills: typeof wrappedOpenAI.skills,
  });

  const missingFilesMessage =
    'The provider does not support file uploads. Make sure it exposes a files() method.';
  const missingSkillsMessage =
    'The provider does not support skills. Make sure it exposes a skills() method.';

  if (
    wrappedFile.status === 'rejected' &&
    errorMessage(wrappedFile.error) === missingFilesMessage &&
    wrappedSkill.status === 'rejected' &&
    errorMessage(wrappedSkill.error) === missingSkillsMessage
  ) {
    throw new Error(
      'ISSUE #21042 REPRODUCED: wrapProvider removed file and skill upload support',
    );
  }

  assert.equal(
    wrappedFile.status,
    'fulfilled',
    'wrapProvider must preserve successful file uploads',
  );
  assert.deepEqual(wrappedFile.value.providerReference, {
    example: 'file-synthetic',
  });

  assert.equal(
    wrappedSkill.status,
    'fulfilled',
    'wrapProvider must preserve successful skill uploads',
  );
  assert.deepEqual(wrappedSkill.value.providerReference, {
    example: 'skill-synthetic',
  });

  assert.equal(typeof wrappedOpenAI.files, 'function');
  assert.equal(typeof wrappedOpenAI.skills, 'function');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
