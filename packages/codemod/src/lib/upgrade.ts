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
  'remove-experimental-wrap-language-model',
  'remove-get-ui-text',
  'remove-google-facade',
  'remove-isxxxerror',
  'remove-metadata-with-headers',
  'remove-mistral-facade',
  'remove-openai-compatibility',
  'remove-openai-facade',
  'remove-sendExtraMessageFields',
  'rename-core-message-to-model-message',
  'rename-datastream-transform-stream',
  'rename-format-stream-part',
  'rename-languagemodelv1providermetadata',
  'rename-max-tokens-to-max-output-tokens',
  'rename-message-to-ui-message',
  'rename-mime-type-to-media-type',
  'rename-parse-stream-part',
  'rename-reasoning-properties',
  'rename-reasoning-to-reasoningText',
  'rename-request-options',
  'replace-baseurl',
  'replace-bedrock-snake-case',
  'replace-content-with-parts',
  'replace-continuation-steps',
  'replace-experimental-provider-metadata',
  'replace-generatetext-text-property',
  'replace-image-type-with-file-type',
  'replace-langchain-toaistream',
  'replace-llamaindex-adapter',
  'replace-nanoid',
  'replace-oncompletion-with-onfinal',
  'replace-provider-metadata-with-provider-options',
  'replace-rawresponse-with-response',
  'replace-redacted-reasoning-type',
  'replace-roundtrips-with-maxsteps',
  'replace-simulate-streaming',
  'replace-textdelta-with-text',
  'replace-token-usage-types',
  'replace-usage-token-properties',
  'restructure-file-stream-parts',
  'restructure-source-stream-parts',
  'rewrite-framework-imports',
  'rsc-package',
  'flatten-streamtext-file-properties',
  'import-LanguageModelV2-from-provider-package',
  'migrate-to-data-stream-protocol-v2',
  'move-image-model-maxImagesPerCall',
  'move-langchain-adapter',
  'move-provider-options',
  'move-react-to-ai-sdk',
  'move-ui-utils-to-ai',
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
