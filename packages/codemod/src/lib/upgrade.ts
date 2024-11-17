import debug from 'debug';
import { transform } from './transform';
import { TransformOptions } from './transform-options';

const bundle = [
  'remove-ai-stream-methods-from-stream-text-result',
  'remove-anthropic-facade',
  'remove-await-streamobject',
  'remove-await-streamtext',
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

export function upgrade(options: TransformOptions) {
  const cwd = process.cwd();
  log('Starting upgrade...');
  for (const [index, codemod] of bundle.entries()) {
    log(`Applying codemod ${index + 1}/${bundle.length}: ${codemod}`);
    transform(codemod, cwd, options);
  }
  log('Upgrade complete.');
}
