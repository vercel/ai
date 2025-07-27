import assert from 'node:assert';
import { mock, test } from 'node:test';

import { verifyChangesets } from './index.js';

test('happy path', async () => {
  const event = {
    pull_request: {
      labels: [],
    },
  };
  const env = {
    CHANGED_FILES: '.changeset/some-happy-path.md',
  };

  const readFile = mock.fn(async path => {
    return `---\nai: patch\n@ai-sdk/provider: patch\n---\n## Test changeset`;
  });

  await verifyChangesets(event, env, readFile);

  assert.strictEqual(readFile.mock.callCount(), 1);
  assert.deepStrictEqual(readFile.mock.calls[0].arguments, [
    '../../../../.changeset/some-happy-path.md',
    'utf-8',
  ]);
});

test('ignores .changeset/README.md', async () => {
  const event = {
    pull_request: {
      labels: [],
    },
  };
  const env = {
    CHANGED_FILES: '.changeset/README.md',
  };

  const readFile = mock.fn(() => {});

  await verifyChangesets(event, env, readFile);

  assert.strictEqual(readFile.mock.callCount(), 0);
});

test('invalid file - not a .changeset file', async () => {
  const event = {
    pull_request: {
      labels: [],
    },
  };
  const env = {
    CHANGED_FILES: '.changeset/not-a-changeset-file.txt',
  };

  const readFile = mock.fn(() => {});

  await assert.rejects(
    () => verifyChangesets(event, env, readFile),
    Object.assign(new Error('Invalid file - not a .changeset file'), {
      path: '.changeset/not-a-changeset-file.txt',
    }),
  );

  assert.strictEqual(readFile.mock.callCount(), 0);
});

test('invalid .changeset file - no frontmatter', async () => {
  const event = {
    pull_request: {
      labels: [],
    },
  };
  const env = {
    CHANGED_FILES: '.changeset/invalid-changeset-file.md',
  };

  const readFile = mock.fn(async path => {
    return 'frontmatter missing';
  });
  await assert.rejects(
    () => verifyChangesets(event, env, readFile),
    Object.assign(new Error('Invalid .changeset file - no frontmatter found'), {
      path: '.changeset/invalid-changeset-file.md',
      content: 'frontmatter missing',
    }),
  );
  assert.strictEqual(readFile.mock.callCount(), 1);
  assert.deepStrictEqual(readFile.mock.calls[0].arguments, [
    '../../../../.changeset/invalid-changeset-file.md',
    'utf-8',
  ]);
});

test('minor update', async () => {
  const event = {
    pull_request: {
      labels: [],
    },
  };
  const env = {
    CHANGED_FILES: '.changeset/patch-update.md .changeset/minor-update.md',
  };

  const readFile = mock.fn(async path => {
    if (path.endsWith('patch-update.md')) {
      return `---\nai: patch\n---\n## Test changeset`;
    }

    return `---\n@ai-sdk/provider: minor\n---\n## Test changeset`;
  });

  await assert.rejects(
    () => verifyChangesets(event, env, readFile),
    Object.assign(
      new Error(
        `Invalid .changeset file - invalid version bump (only "patch" is allowed, see https://ai-sdk.dev/docs/migration-guides/versioning). To bypass, add one of the following labels: minor, major`,
      ),
      {
        path: '.changeset/minor-update.md',
        content: '---\n@ai-sdk/provider: minor\n---\n## Test changeset',
      },
    ),
  );

  assert.strictEqual(readFile.mock.callCount(), 2);
  assert.deepStrictEqual(readFile.mock.calls[0].arguments, [
    '../../../../.changeset/patch-update.md',
    'utf-8',
  ]);
  assert.deepStrictEqual(readFile.mock.calls[1].arguments, [
    '../../../../.changeset/minor-update.md',
    'utf-8',
  ]);
});

test('minor update - with "minor" label', async () => {
  const event = {
    pull_request: {
      labels: [
        {
          name: 'minor',
        },
      ],
    },
  };
  const env = {
    CHANGED_FILES: '.changeset/patch-update.md .changeset/minor-update.md',
  };

  const readFile = mock.fn(async path => {
    if (path.endsWith('patch-update.md')) {
      return `---\nai: patch\n---\n## Test changeset`;
    }

    return `---\n@ai-sdk/provider: minor\n---\n## Test changeset`;
  });

  const message = await verifyChangesets(event, env, readFile);
  assert.strictEqual(
    message,
    'Skipping changeset verification - "minor" label found',
  );
});

test('major update - with "major" label', async () => {
  const event = {
    pull_request: {
      labels: [
        {
          name: 'major',
        },
      ],
    },
  };
  const env = {
    CHANGED_FILES: '.changeset/patch-update.md .changeset/major-update.md',
  };

  const readFile = mock.fn(async path => {
    if (path.endsWith('patch-update.md')) {
      return `---\nai: patch\n---\n## Test changeset`;
    }

    return `---\n@ai-sdk/provider: major\n---\n## Test changeset`;
  });

  const message = await verifyChangesets(event, env, readFile);
  assert.strictEqual(
    message,
    'Skipping changeset verification - "major" label found',
  );
});
