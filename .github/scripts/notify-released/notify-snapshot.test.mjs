import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSnapshotComment,
  selectPullRequest,
  selectSnapshotPackages,
} from './notify-snapshot.mjs';

test('selectSnapshotPackages selects and sorts public packages from the current snapshot', () => {
  assert.deepEqual(
    selectSnapshotPackages(
      [
        {
          name: 'ai',
          version: '0.0.0-12345678-20260811180950',
        },
        {
          name: '@ai-sdk/provider',
          version: '4.0.0',
        },
        {
          name: '@ai-sdk/code-mode',
          version: '0.0.0-12345678-20260811180950',
        },
        {
          name: '@example/private',
          version: '0.0.0-12345678-20260811180950',
          private: true,
        },
        {
          name: '@ai-sdk/other-snapshot',
          version: '0.0.0-87654321-20260811180950',
        },
      ],
      '12345678',
    ),
    [
      {
        name: '@ai-sdk/code-mode',
        version: '0.0.0-12345678-20260811180950',
      },
      {
        name: 'ai',
        version: '0.0.0-12345678-20260811180950',
      },
    ],
  );
});

test('selectPullRequest matches the open pull request head repository and ref', () => {
  assert.deepEqual(
    selectPullRequest(
      [
        {
          number: 1,
          state: 'closed',
          head: { ref: 'feature', repo: { full_name: 'vercel/ai' } },
        },
        {
          number: 2,
          state: 'open',
          head: { ref: 'other-feature', repo: { full_name: 'vercel/ai' } },
        },
        {
          number: 3,
          state: 'open',
          head: { ref: 'feature', repo: { full_name: 'vercel/ai' } },
        },
      ],
      'feature',
      'vercel/ai',
    ),
    {
      number: 3,
      state: 'open',
      head: { ref: 'feature', repo: { full_name: 'vercel/ai' } },
    },
  );
});

test('selectPullRequest returns null when the workflow ref has no open pull request', () => {
  assert.equal(
    selectPullRequest(
      [
        {
          number: 1,
          state: 'open',
          head: { ref: 'feature', repo: { full_name: 'someone/ai' } },
        },
      ],
      'feature',
      'vercel/ai',
    ),
    null,
  );
});

test('selectPullRequest rejects an ambiguous workflow ref', () => {
  assert.throws(
    () =>
      selectPullRequest(
        [
          {
            number: 1,
            state: 'open',
            head: { ref: 'feature', repo: { full_name: 'vercel/ai' } },
          },
          {
            number: 2,
            state: 'open',
            head: { ref: 'feature', repo: { full_name: 'vercel/ai' } },
          },
        ],
        'feature',
        'vercel/ai',
      ),
    /Found multiple open pull requests.*#1, #2/,
  );
});

test('createSnapshotComment lists npm-linked package versions and the workflow run', () => {
  assert.equal(
    createSnapshotComment(
      [
        {
          name: '@ai-sdk/code-mode',
          version: '0.0.0-12345678-20260811180950',
        },
      ],
      'https://github.com/vercel/ai/actions/runs/123',
    ),
    `:test_tube: Snapshot release published:

| Package | Version |
| --- | --- |
| \`@ai-sdk/code-mode\` | [0.0.0-12345678-20260811180950](https://www.npmjs.com/package/%40ai-sdk%2Fcode-mode/v/0.0.0-12345678-20260811180950) |

[View workflow run](https://github.com/vercel/ai/actions/runs/123)`,
  );
});
