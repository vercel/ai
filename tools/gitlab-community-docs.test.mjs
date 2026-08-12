import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  extractGitLabFactoryModelIds,
  findUnregisteredGitLabDocModelIds,
  treatsDuoChatAsDefaultModel,
} from './gitlab-community-docs.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const gitlabPage = resolve(
  repoRoot,
  'content/providers/05-community-providers/53-gitlab.mdx',
);

const brokenSnippet = `
const { text } = await generateText({
  model: gitlab.chat('duo-chat'),
  prompt: 'Explain how to create a merge request in GitLab',
});

gitlab('duo-chat');
gitlab.languageModel('duo-chat');
gitlab.agenticChat('duo-chat');
`;

test('rejects the unregistered duo-chat factory ID used in the 4.1.0 README', () => {
  assert.deepEqual(extractGitLabFactoryModelIds(brokenSnippet), [
    'duo-chat',
    'duo-chat',
    'duo-chat',
    'duo-chat',
  ]);
  assert.deepEqual(findUnregisteredGitLabDocModelIds(brokenSnippet), [
    'duo-chat',
    'duo-chat',
    'duo-chat',
    'duo-chat',
  ]);
});

test('accepts registered 4.1.0 MODEL_MAPPINGS IDs', () => {
  const source = `
    gitlab.chat('duo-chat-sonnet-4-5');
    gitlab('duo-chat-sonnet-4-5');
    gitlab.languageModel('duo-chat-sonnet-4-5');
    gitlab.agenticChat('duo-chat-opus-4-5');
    gitlab.workflowChat('duo-workflow');
  `;
  assert.deepEqual(findUnregisteredGitLabDocModelIds(source), []);
});

test('detects copy that calls duo-chat the default model', () => {
  assert.equal(
    treatsDuoChatAsDefaultModel(
      'You can create a chat model with the default `duo-chat` ID:',
    ),
    true,
  );
  assert.equal(
    treatsDuoChatAsDefaultModel(
      'You can create a chat model with a registered model ID such as `duo-chat-sonnet-4-5`:',
    ),
    false,
  );
});

test('GitLab community provider page only uses registered model IDs', () => {
  const source = readFileSync(gitlabPage, 'utf8');
  const ids = extractGitLabFactoryModelIds(source);
  assert.ok(ids.length > 0, 'expected factory examples on the GitLab page');
  assert.deepEqual(findUnregisteredGitLabDocModelIds(source), []);
  assert.equal(treatsDuoChatAsDefaultModel(source), false);
  assert.ok(ids.includes('duo-chat-sonnet-4-5'));
});
