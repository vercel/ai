import debug from 'debug';
import { transform, TransformErrors } from './transform';
import { TransformOptions } from './transform-options';
import { SingleBar, Presets } from 'cli-progress';

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
const error = debug('codemod:upgrade:error');

export function upgrade(options: TransformOptions) {
  const cwd = process.cwd();
  log('Starting upgrade...');
  const modCount = bundle.length;
  const bar = new SingleBar(
    {
      format: 'Progress |{bar}| {percentage}% | ETA: {eta}s || {codemod}',
      hideCursor: true,
    },
    Presets.shades_classic,
  );
  bar.start(modCount, 0, { codemod: 'Starting...' });
  const allErrors: TransformErrors = [];
  for (const [index, codemod] of bundle.entries()) {
    const errors = transform(codemod, cwd, options, { logStatus: false });
    allErrors.push(...errors);
    bar.increment(1, { codemod });
  }
  bar.stop();

  if (allErrors.length > 0) {
    log('Some codemods did not apply successfully to all files. Details:');
    allErrors.forEach(({ transform, filename, summary }) => {
      error(`codemod=${transform}, path=${filename}, summary=${summary}`);
    });
  }

  log('Upgrade complete.');
}
