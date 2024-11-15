import { execSync } from 'child_process';
import debug from 'debug';
import fs from 'fs';
import path from 'path';
import { TransformOptions } from './transform-options';

function getJscodeshift(): string {
  const localJscodeshift = path.resolve(
    __dirname,
    '../../node_modules/.bin/jscodeshift',
  );
  return fs.existsSync(localJscodeshift) ? localJscodeshift : 'jscodeshift';
}

const log = debug('codemod:transform');
const error = debug('codemod:transform:error');

export function transform(
  codemod: string,
  source: string,
  options: TransformOptions,
) {
  log(`Applying codemod '${codemod}': ${source}`);

  const codemodPath = path.resolve(__dirname, `../codemods/${codemod}.js`);
  const targetPath = path.resolve(source);
  const jscodeshift = getJscodeshift();
  let command = `${jscodeshift} -t ${codemodPath} ${targetPath} --parser tsx --ignore-pattern="**/node_modules/**" --ignore-pattern="**/.next/**"`;

  if (options.dry) {
    command += ' --dry';
  }

  if (options.print) {
    command += ' --print';
  }

  if (options.verbose) {
    command += ' --verbose';
  }

  if (options.jscodeshift) {
    command += ` ${options.jscodeshift}`;
  }

  try {
    execSync(command, { stdio: 'inherit' });
    log('Codemod applied successfully.');
  } catch (err) {
    error('Error applying codemod:', err);
  }
}
