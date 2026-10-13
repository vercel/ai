import { execFileSync } from 'child_process';
import debug from 'debug';
import path from 'path';
import parse from 'shell-quote/parse';
import type { TransformOptions } from './transform-options';

const log = debug('codemod:transform');
const error = debug('codemod:transform:error');

function getJscodeshift(): string {
  return require.resolve('jscodeshift/bin/jscodeshift.js');
}

function parseJscodeshiftArguments(options: string): string[] {
  return parse(options, process.env).flatMap(argument => {
    if (typeof argument === 'string') {
      return argument;
    }

    if ('pattern' in argument) {
      return argument.pattern;
    }

    if ('comment' in argument) {
      return [];
    }

    throw new Error(
      `Shell operator '${argument.op}' is not supported in jscodeshift options.`,
    );
  });
}

function buildArguments(
  codemodPath: string,
  targetPath: string,
  options: TransformOptions,
): string[] {
  // Ignoring everything under `.*/` covers `.next/` along with any other
  // framework build related or otherwise intended-to-be-hidden directories.
  const args = [
    '-t',
    codemodPath,
    targetPath,
    '--parser',
    'tsx',
    '--ignore-pattern=**/node_modules/**',
    '--ignore-pattern=**/.*/**',
    '--ignore-pattern=**/dist/**',
    '--ignore-pattern=**/build/**',
    '--ignore-pattern=**/*.min.js',
    '--ignore-pattern=**/*.bundle.js',
  ];

  if (options.dry) {
    args.push('--dry');
  }

  if (options.print) {
    args.push('--print');
  }

  if (options.verbose) {
    args.push('--verbose');
  }

  if (options.jscodeshift) {
    args.push(...parseJscodeshiftArguments(options.jscodeshift));
  }

  return args;
}

export type TransformErrors = {
  transform: string;
  filename: string;
  summary: string;
}[];

function parseErrors(transform: string, output: string): TransformErrors {
  const errors: TransformErrors = [];
  const errorRegex = /ERR (.+) Transformation error/g;
  const syntaxErrorRegex = /SyntaxError: .+/g;

  let match;
  while ((match = errorRegex.exec(output)) !== null) {
    const filename = match[1];
    const syntaxErrorMatch = syntaxErrorRegex.exec(output);
    if (syntaxErrorMatch) {
      const summary = syntaxErrorMatch[0];
      errors.push({ transform, filename, summary });
    }
  }

  return errors;
}

function parseNotImplementedErrors(
  transform: string,
  output: string,
): TransformErrors {
  const notImplementedErrors: TransformErrors = [];
  const notImplementedRegex = /Not Implemented (.+): (.+)/g;

  let match;
  while ((match = notImplementedRegex.exec(output)) !== null) {
    const filename = match[1];
    const summary = match[2];
    notImplementedErrors.push({ transform, filename, summary });
  }

  return notImplementedErrors;
}

export function transform(
  codemod: string,
  source: string,
  transformOptions: TransformOptions,
  options: { logStatus: boolean } = { logStatus: true },
): { errors: TransformErrors; notImplementedErrors: TransformErrors } {
  if (options.logStatus) {
    log(`Applying codemod '${codemod}': ${source}`);
  }
  const codemodPath = path.resolve(__dirname, `../codemods/${codemod}.js`);
  const targetPath = path.resolve(source);
  const jscodeshift = getJscodeshift();
  const args = buildArguments(codemodPath, targetPath, transformOptions);
  const stdout = execFileSync(process.execPath, [jscodeshift, ...args], {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  const errors = parseErrors(codemod, stdout);
  const notImplementedErrors = parseNotImplementedErrors(codemod, stdout);
  if (options.logStatus) {
    if (errors.length > 0) {
      errors.forEach(({ transform, filename, summary }) => {
        error(
          `Error applying codemod [codemod=${transform}, path=${filename}, summary=${summary}]`,
        );
      });
    }

    if (notImplementedErrors.length > 0) {
      log(
        `Some files require manual changes. Please search your codebase for \`FIXME(@ai-sdk-upgrade-v5): \` comments and follow the instructions to complete the upgrade.`,
      );
      notImplementedErrors.forEach(({ transform, filename, summary }) => {
        log(
          `Not Implemented [codemod=${transform}, path=${filename}, summary=${summary}]`,
        );
      });
    }
  }

  return { errors, notImplementedErrors };
}
