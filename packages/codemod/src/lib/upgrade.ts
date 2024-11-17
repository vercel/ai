import debug from 'debug';
import { readFileSync } from 'fs';
import semver from 'semver';
import { transform } from './transform';
import { TransformOptions } from './transform-options';
import { globSync } from 'glob';

const bundle = [
  'remove-ai-stream-methods-from-stream-text-result',
  'remove-anthropic-facade',
  'remove-deprecated-provider-registry-exports',
  'remove-experimental-ai-fn-exports',
  'remove-experimental-message-types',
  'remove-experimental-streamdata',
  'remove-experimental-tool',
  'remove-experimental-useassistant',
  'remove-google-facade',
  'remove-isxxxerror',
  'remove-metadata-with-headers',
  'remove-mistral-facade',
  'remove-openai-facade',
  'rename-format-stream-part',
  'rename-parse-stream-part',
  'replace-baseurl',
  'replace-continuation-steps',
  'replace-langchain-toaistream',
  'replace-nanoid',
  'replace-roundtrips-with-maxsteps',
  'replace-token-usage-types',
  'rewrite-framework-imports',
];

const log = debug('codemod:upgrade');

const SDK_MIN_VERSION_REQUIRED = '4.0.0';

function validatePackageVersions(cwd: string) {
  // Find all package.json files from the root down
  const paths = globSync('**/package.json', {
    cwd,
    absolute: true,
    ignore: 'node_modules/**',
  });

  // Gather all 'ai' package versions
  const packageVersions: Array<{ path: string; version: string }> = [];
  paths.forEach(p => {
    const config = JSON.parse(readFileSync(p, 'utf8'));
    const dependencyTypes = ['dependencies', 'devDependencies'];
    for (const depType of dependencyTypes) {
      if (config[depType] && config[depType]['ai']) {
        packageVersions.push({ path: p, version: config[depType]['ai'] });
      }
    }
  });

  // Require that there be at least one 'ai' package version and that all meet
  // the minimum sdk version requirement.
  if (packageVersions.length === 0) {
    throw new Error("No 'ai' package found in any package.json");
  }
  packageVersions.forEach(v => {
    const coercedVersion = semver.coerce(v.version);
    if (coercedVersion && semver.lt(coercedVersion, SDK_MIN_VERSION_REQUIRED)) {
      throw new Error(
        `'ai' package version is less than ${SDK_MIN_VERSION_REQUIRED} [path=${v.path}, version=${v.version}]`,
      );
    }
  });
}

export function upgrade(options: TransformOptions) {
  const cwd = process.cwd();
  log('Starting upgrade...');
  validatePackageVersions(cwd);
  log('Applying codemods...');
  for (const [index, codemod] of bundle.entries()) {
    log(`Applying codemod ${index + 1}/${bundle.length}: ${codemod}`);
    transform(codemod, cwd, options);
  }
  log('Upgrade complete.');
}
