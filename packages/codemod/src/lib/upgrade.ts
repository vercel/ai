import fs from 'fs';
import path from 'path';
import semver from 'semver';
import { transform } from './transform';
import { TransformOptions } from './transform-options';

const bundle = [
  'remove-ai-stream-methods-from-stream-text-result',
  'remove-experimental-ai-fn-exports',
  'replace-baseurl',
  'replace-nanoid',
  'rewrite-framework-imports',
  'remove-experimental-message-types',
];

function validatePreconditions(cwd: string) {
  const pkgPath = path.join(cwd, 'package.json');

  if (!fs.existsSync(pkgPath)) {
    throw new Error('No package.json found in current directory');
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const aiVersion = pkg.dependencies?.ai || pkg.devDependencies?.ai;

  if (!aiVersion) {
    throw new Error('No ai package found in dependencies');
  }

  const version = semver.clean(aiVersion.replace(/^[\^~]/, ''));
  if (!version || !semver.gte(version, '3.4.0')) {
    throw new Error('ai package must be at least version 3.4.0');
  }
}

export function upgrade(options: TransformOptions) {
  const cwd = process.cwd();
  validatePreconditions(cwd);
  console.log('Applying codemods...');
  for (const codemod of bundle) {
    transform(codemod, cwd, options);
  }
}
