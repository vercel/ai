#!/usr/bin/env node

import { Command } from 'commander';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const program = new Command();

const runCodemod = (codemod: string, source: string, options: any) => {
  const codemodPath = path.resolve(__dirname, `../codemods/${codemod}.js`);
  const targetPath = path.resolve(source);

  // Determine the path to jscodeshift
  const localJscodeshift = path.resolve(
    __dirname,
    '../../node_modules/.bin/jscodeshift',
  );
  const jscodeshift = fs.existsSync(localJscodeshift)
    ? localJscodeshift
    : 'jscodeshift';

  let command = `${jscodeshift} -t ${codemodPath} ${targetPath} --parser tsx`;

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
    console.log('Codemod applied successfully.');
  } catch (error) {
    console.error('Error applying codemod:', error);
  }
};

program
  .name('codemod-tool')
  .description('CLI tool for running codemods')
  .version('1.0.0')
  .argument('<codemod>', 'Codemod to run (e.g., rewrite-framework-imports)')
  .argument('<source>', 'Path to source files or directory to transform')
  .option('-d, --dry', 'Dry run (no changes are made to files)')
  .option('-p, --print', 'Print transformed files to stdout')
  .option('--verbose', 'Show more information about the transform process')
  .option('-j, --jscodeshift <options>', 'Pass options directly to jscodeshift')
  .action((codemod, source, options) => {
    runCodemod(codemod, source, options);
  });

program.parse(process.argv);
