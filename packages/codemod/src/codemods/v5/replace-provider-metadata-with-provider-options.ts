import { createTransformer } from '../lib/create-transformer';

const aiMethods = new Set([
  'embed',
  'embedMany',
  'generateImage',
  'generateObject',
  'generateSpeech',
  'generateText',
  'render',
  'streamObject',
  'streamText',
  'streamUI',
  'transcribe',
]);

export default createTransformer((fileInfo, api, options, context) => {
  const { j, root } = context;

  // Only request options changed names in v5. Returned metadata, including
  // member access, destructuring, and result types, remains providerMetadata.
  root.find(j.CallExpression).forEach(path => {
    const { callee, arguments: args } = path.node;

    if (
      callee.type !== 'Identifier' ||
      !aiMethods.has(callee.name) ||
      args.length === 0
    ) {
      return;
    }

    let options: any = args[0];

    while (
      options.type === 'TSAsExpression' ||
      options.type === 'TSSatisfiesExpression' ||
      options.type === 'TSTypeAssertion'
    ) {
      options = options.expression;
    }

    if (options.type !== 'ObjectExpression') {
      return;
    }

    options.properties.forEach((property: any) => {
      if (property.type !== 'Property' && property.type !== 'ObjectProperty') {
        return;
      }

      const key = property.key;

      if (key.type === 'Identifier' && key.name === 'providerMetadata') {
        if (property.shorthand) {
          property.shorthand = false;
        }
        key.name = 'providerOptions';
        context.hasChanges = true;
      } else if (
        key.type === 'StringLiteral' &&
        key.value === 'providerMetadata'
      ) {
        key.value = 'providerOptions';
        context.hasChanges = true;
      }
    });
  });
});
