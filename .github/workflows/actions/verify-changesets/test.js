import assert from 'node:assert';
import { mock, test } from 'node:test';

import { verifyChangesets } from './index.js';

function mockReadFile(handler) {
  return mock.fn(async (path, encoding) => {
    return handler(path, encoding);
  });
}

function mockLstat({ isSymlink = false } = {}) {
  return mock.fn(async () => ({
    isSymbolicLink: () => isSymlink,
  }));
}

test('happy path', async () => {
  const event = {
    pull_request: {
      labels: [],
    },
  };
  const env = {
    CHANGED_FILES: '.changeset/some-happy-path.md',
  };

  const readFile = mockReadFile(
    async () =>
      `---\nai: patch\n@ai-sdk/provider: patch\n---\n## Test changeset`,
  );
  const lstat = mockLstat();

  await verifyChangesets(event, env, readFile, lstat);

  assert.strictEqual(readFile.mock.callCount(), 1);
  assert.deepStrictEqual(readFile.mock.calls[0].arguments, [
    '../../../../.changeset/some-happy-path.md',
    'utf-8',
  ]);
  assert.strictEqual(lstat.mock.callCount(), 1);
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

  const readFile = mockReadFile(() => {});
  const lstat = mockLstat();

  await verifyChangesets(event, env, readFile, lstat);

  assert.strictEqual(readFile.mock.callCount(), 0);
  assert.strictEqual(lstat.mock.callCount(), 0);
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

  const readFile = mockReadFile(() => {});
  const lstat = mockLstat();

  await assert.rejects(
    () => verifyChangesets(event, env, readFile, lstat),
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

  const readFile = mockReadFile(async () => 'frontmatter missing');
  const lstat = mockLstat();

  await assert.rejects(
    () => verifyChangesets(event, env, readFile, lstat),
    Object.assign(new Error('Invalid .changeset file - no frontmatter found'), {
      path: '.changeset/invalid-changeset-file.md',
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

  const readFile = mockReadFile(async path => {
    if (path.endsWith('patch-update.md')) {
      return `---\nai: patch\n---\n## Test changeset`;
    }

    return `---\n@ai-sdk/provider: minor\n---\n## Test changeset`;
  });
  const lstat = mockLstat();

  await assert.rejects(
    () => verifyChangesets(event, env, readFile, lstat),
    Object.assign(
      new Error(
        `Invalid .changeset file - invalid version bump (only "patch" is allowed, see https://ai-sdk.dev/docs/migration-guides/versioning). To bypass, add one of the following labels: minor, major`,
      ),
      {
        path: '.changeset/minor-update.md',
        frontmatter: '---\n@ai-sdk/provider: minor\n---',
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

test('rejects symlinked changeset files', async () => {
  const event = {
    pull_request: {
      labels: [],
    },
  };
  const env = {
    CHANGED_FILES: '.changeset/evil-symlink.md',
  };

  const readFile = mockReadFile(async () => 'should not be read');
  const lstat = mockLstat({ isSymlink: true });

  await assert.rejects(
    () => verifyChangesets(event, env, readFile, lstat),
    Object.assign(
      new Error('Invalid .changeset file - symlinks are not allowed'),
      { path: '.changeset/evil-symlink.md' },
    ),
  );

  assert.strictEqual(readFile.mock.callCount(), 0);
  assert.strictEqual(lstat.mock.callCount(), 1);
});

test('error does not include raw file content', async () => {
  const event = {
    pull_request: {
      labels: [],
    },
  };
  const env = {
    CHANGED_FILES: '.changeset/bad-frontmatter.md',
  };

  const readFile = mockReadFile(
    async () => '---\n@ai-sdk/provider: minor\n---\nSensitive content here',
  );
  const lstat = mockLstat();

  try {
    await verifyChangesets(event, env, readFile, lstat);
    assert.fail('Expected error to be thrown');
  } catch (error) {
    assert.strictEqual(error.frontmatter, '---\n@ai-sdk/provider: minor\n---');
    assert.strictEqual(error.content, undefined);
  }
});
