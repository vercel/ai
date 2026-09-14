import assert from 'node:assert/strict';
import test from 'node:test';
import { tools } from '../../../content/tools-registry/registry.ts';

// The registry is rendered at https://ai-sdk.dev/resources/tools, and its `codeExample`
// is copied by readers into real projects. These checks cover the parts a type is unable
// to: that an install command installs the package it claims to, that an example imports
// the package it is an example of, and that every link is a link.

const entry = (slug) => {
  const found = tools.find((tool) => tool.slug === slug);
  assert.ok(found, `no registry entry with slug '${slug}'`);
  return found;
};

test('slugs are unique', () => {
  const slugs = tools.map((tool) => tool.slug);
  assert.equal(new Set(slugs).size, slugs.length);
});

test('every entry has the fields the page renders', () => {
  for (const tool of tools) {
    for (const field of ['slug', 'name', 'description', 'packageName', 'codeExample']) {
      assert.equal(typeof tool[field], 'string', `${tool.slug}: ${field} must be a string`);
      assert.ok(tool[field].length > 0, `${tool.slug}: ${field} must not be empty`);
    }
    assert.ok(tool.installCommand, `${tool.slug}: installCommand is required`);
  }
});

test('every install command installs the package the entry names', () => {
  for (const tool of tools) {
    for (const manager of ['pnpm', 'npm', 'yarn', 'bun']) {
      const command = tool.installCommand[manager];
      assert.equal(typeof command, 'string', `${tool.slug}: missing ${manager} install command`);
      assert.ok(
        command.includes(tool.packageName),
        `${tool.slug}: ${manager} command does not install ${tool.packageName}`,
      );
    }
  }
});

test('every code example imports the package it demonstrates', () => {
  for (const tool of tools) {
    assert.ok(
      tool.codeExample.includes(tool.packageName),
      `${tool.slug}: codeExample never imports ${tool.packageName}`,
    );
  }
});

test('every link is https', () => {
  for (const tool of tools) {
    for (const field of ['docsUrl', 'apiKeyUrl', 'websiteUrl', 'npmUrl']) {
      const url = tool[field];
      if (url === undefined) continue;
      assert.ok(url.startsWith('https://'), `${tool.slug}: ${field} is not https (${url})`);
    }
  }
});

test('an npmUrl points at its own package', () => {
  for (const tool of tools) {
    if (!tool.npmUrl) continue;
    assert.ok(
      tool.npmUrl.includes(tool.packageName),
      `${tool.slug}: npmUrl does not point at ${tool.packageName}`,
    );
  }
});

// Fatstack's example spends real money, so its spend guard is not decoration. `guards` is
// a required argument with no default in `@fatstack/ai-sdk-tools`: omitting it is a type
// error, and at runtime it throws before the catalogue is fetched. An example that drops
// it would not compile, and would teach the one thing this integration must not teach.
test('the fatstack example configures the spend guards it requires', () => {
  const fatstack = entry('fatstack');
  assert.match(fatstack.codeExample, /guards:\s*\{/, 'example must pass guards');
  assert.match(fatstack.codeExample, /maxPerDay:\s*[\d.]+/, 'guards must set a daily ceiling');
  assert.match(fatstack.codeExample, /fatstackTools\(/, 'example must call fatstackTools');
  assert.match(fatstack.codeExample, /wallet:/, 'example must supply a wallet');
});

test('the fatstack example pays on a testnet, not mainnet', () => {
  // A copy-pasted example should not spend real USDC on someone's first run.
  const fatstack = entry('fatstack');
  assert.match(fatstack.codeExample, /networks:\s*\['base-sepolia'\]/);
});

test('the fatstack entry documents the AI SDK integration specifically', () => {
  const fatstack = entry('fatstack');
  assert.equal(fatstack.docsUrl, 'https://www.fatstack.net/docs/ai-sdk');
  assert.equal(fatstack.packageName, '@fatstack/ai-sdk-tools');
});
