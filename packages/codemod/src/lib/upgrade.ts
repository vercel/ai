import debug from 'debug';
import { transform, TransformErrors } from './transform';
import { TransformOptions } from './transform-options';
import { SingleBar, Presets } from 'cli-progress';

const bundle = [
  'v4/remove-ai-stream-methods-from-stream-text-result',
  'v4/remove-anthropic-facade',
  'v4/remove-await-streamobject',
  'v4/remove-await-streamtext',
  'v4/remove-deprecated-provider-registry-exports',
  'v4/remove-experimental-ai-fn-exports',
  'v4/remove-experimental-message-types',
  'v4/remove-experimental-streamdata',
  'v4/remove-experimental-tool',
  'v4/remove-experimental-useassistant',
  'v5/remove-experimental-wrap-language-model',
  'v5/remove-get-ui-text',
  'v4/remove-google-facade',
  'v4/remove-isxxxerror',
  'v4/remove-metadata-with-headers',
  'v4/remove-mistral-facade',
  'v5/remove-openai-compatibility',
  'v4/remove-openai-facade',
  'v5/remove-sendExtraMessageFields',
  'v5/rename-core-message-to-model-message',
  'v5/rename-datastream-transform-stream',
  'v4/rename-format-stream-part',
  'v5/rename-languagemodelv1providermetadata',
  'v5/rename-max-tokens-to-max-output-tokens',
  'v5/rename-message-to-ui-message',
  'v5/rename-mime-type-to-media-type',
  'v4/rename-parse-stream-part',
  'v5/rename-reasoning-properties',
  'v5/rename-reasoning-to-reasoningText',
  'v5/rename-request-options',
  'v4/replace-baseurl',
  'v5/replace-bedrock-snake-case',
  'v5/replace-content-with-parts',
  'v4/replace-continuation-steps',
  'v5/replace-experimental-provider-metadata',
  'v5/replace-generatetext-text-property',
  'v5/replace-image-type-with-file-type',
  'v4/replace-langchain-toaistream',
  'v5/replace-llamaindex-adapter',
  'v4/replace-nanoid',
  'v5/replace-oncompletion-with-onfinal',
  'v5/replace-provider-metadata-with-provider-options',
  'v5/replace-rawresponse-with-response',
  'v5/replace-redacted-reasoning-type',
  'v4/replace-roundtrips-with-maxsteps',
  'v5/replace-simulate-streaming',
  'v5/replace-textdelta-with-text',
  'v4/replace-token-usage-types',
  'v5/replace-usage-token-properties',
  'v5/restructure-file-stream-parts',
  'v5/restructure-source-stream-parts',
  'v4/rewrite-framework-imports',
  'v5/rsc-package',
  'v5/flatten-streamtext-file-properties',
  'v5/import-LanguageModelV2-from-provider-package',
  'v5/migrate-to-data-stream-protocol-v2',
  'v5/move-image-model-maxImagesPerCall',
  'v5/move-langchain-adapter',
  'v5/move-provider-options',
  'v5/move-react-to-ai-sdk',
  'v5/move-ui-utils-to-ai',
];

const log = debug('codemod:upgrade');
const error = debug('codemod:upgrade:error');

// Extract v4 and v5 codemods from the bundle
const v4Bundle = bundle.filter(codemod => codemod.startsWith('v4/'));
const v5Bundle = bundle.filter(codemod => codemod.startsWith('v5/'));

function runCodemods(
  codemods: string[],
  options: TransformOptions,
  versionLabel: string,
) {
  const cwd = process.cwd();
  log(`Starting ${versionLabel} codemods...`);
  const modCount = codemods.length;
  const bar = new SingleBar(
    {
      format: 'Progress |{bar}| {percentage}% | ETA: {eta}s || {codemod}',
      hideCursor: true,
    },
    Presets.shades_classic,
  );
  bar.start(modCount, 0, { codemod: 'Starting...' });
  const allErrors: TransformErrors = [];
  for (const [index, codemod] of codemods.entries()) {
    const errors = transform(codemod, cwd, options, { logStatus: false });
    allErrors.push(...errors);
    bar.increment(1, { codemod });
  }
  bar.stop();

  if (allErrors.length > 0) {
    log(
      `Some ${versionLabel} codemods did not apply successfully to all files. Details:`,
    );
    allErrors.forEach(({ transform, filename, summary }) => {
      error(`codemod=${transform}, path=${filename}, summary=${summary}`);
    });
  }

  log(`${versionLabel} codemods complete.`);
}

export function upgradeV4(options: TransformOptions) {
  runCodemods(v4Bundle, options, 'v4');
}

export function upgradeV5(options: TransformOptions) {
  runCodemods(v5Bundle, options, 'v5');
}

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
