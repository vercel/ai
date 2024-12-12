#!/usr/bin/env node

import debug from 'debug';
import { Command } from 'commander';
import { transform } from '../lib/transform';
import { upgrade } from '../lib/upgrade';
import { TransformOptions } from '../lib/transform-options';

const log = debug('codemod');
const error = debug('codemod:error');
debug.enable('codemod:*');

const program = new Command();

const addTransformOptions = (command: Command): Command => {
  return command
    .option('-d, --dry', 'Dry run (no changes are made to files)')
    .option('-p, --print', 'Print transformed files to stdout')
    .option('--verbose', 'Show more information about the transform process')
    .option(
      '-j, --jscodeshift <options>',
      'Pass options directly to jscodeshift',
    );
};

addTransformOptions(
  program
    .name('codemod')
    .description('CLI tool for running codemods')
    .argument('<codemod>', 'Codemod to run (e.g., rewrite-framework-imports)')
    .argument('<source>', 'Path to source files or directory to transform'),
).action((codemod, source, options: TransformOptions) => {
  try {
    transform(codemod, source, options);
  } catch (err: any) {
    error(`Error transforming: ${err}`);
    process.exit(1);
  }
});

addTransformOptions(
  program
    .command('upgrade')
    .description('Upgrade ai package dependencies and apply codemods'),
).action((options: TransformOptions) => {
  try {
    upgrade(options);
  } catch (err: any) {
    error(`Error upgrading: ${err}`);
    process.exit(1);
  }
});

program.parse(process.argv);
