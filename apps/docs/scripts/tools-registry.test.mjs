import assert from 'node:assert/strict';
import test from 'node:test';
import { tools } from '../../../content/tools-registry/registry.ts';

// Checks for the fatstack registry entry. The entry is rendered at
// https://ai-sdk.dev/resources/tools and its codeExample is pasted into real projects, so
// these cover the parts the Tool type cannot: that the install commands install the package
// the entry names, that the example imports it, and that the links are links.

const fatstack = tools.find((tool) => tool.slug === 'fatstack');

test('the entry is present and complete', () => {
  assert.ok(fatstack, "no registry entry with slug 'fatstack'");
  for (const field of ['slug', 'name', 'description', 'packageName', 'codeExample']) {
    assert.equal(typeof fatstack[field], 'string', `${field} must be a string`);
    assert.ok(fatstack[field].length > 0, `${field} must not be empty`);
  }
});

test('every install command installs the package the entry names', () => {
  for (const manager of ['pnpm', 'npm', 'yarn', 'bun']) {
    const command = fatstack.installCommand[manager];
    assert.equal(typeof command, 'string', `missing ${manager} install command`);
    assert.ok(
      command.includes(fatstack.packageName),
      `${manager} command does not install ${fatstack.packageName}`,
    );
  }
});

test('the links point where they claim', () => {
  assert.equal(fatstack.packageName, '@fatstack/ai-sdk-tools');
  assert.equal(fatstack.docsUrl, 'https://www.fatstack.net/docs/ai-sdk');
  assert.ok(fatstack.npmUrl.includes(fatstack.packageName));
  for (const field of ['docsUrl', 'websiteUrl', 'npmUrl']) {
    assert.ok(fatstack[field].startsWith('https://'), `${field} is not https`);
  }
});

// `guards` is a required argument with no default: omitting it is a type error, and at
// runtime it throws before the catalogue is fetched. Asserting the example *mentions*
// guards would only check its spelling, so whether it actually compiles against the package
// is checked upstream, where the package is installed:
// https://github.com/f4tst4ck/fatstack-tools/blob/main/integrations/ai-sdk-tools/example/ai-sdk-registry.ts
// That file is this snippet, and it is in the tsconfig — dropping `guards`, dropping
// `maxPerDay` or renaming an option each fail the build there.
test('the example configures the spend guards the package requires', () => {
  assert.match(fatstack.codeExample, /guards:\s*\{/, 'example must pass guards');
  assert.match(fatstack.codeExample, /maxPerDay:\s*[\d.]+/, 'guards must set a daily ceiling');
  assert.match(fatstack.codeExample, /fatstackTools\(/, 'example must call fatstackTools');
  assert.match(fatstack.codeExample, /wallet:/, 'example must supply a wallet');
});

test('the example imports the package it demonstrates', () => {
  assert.ok(
    fatstack.codeExample.includes(fatstack.packageName),
    `codeExample never imports ${fatstack.packageName}`,
  );
});

test('the example pays on a testnet, not mainnet', () => {
  // A copy-pasted example should not spend real USDC on someone's first run.
  assert.match(fatstack.codeExample, /networks:\s*\['base-sepolia'\]/);
});
