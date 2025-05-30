import { createTransformer } from './lib/create-transformer';

/*
TODO: describe what the codemod does
*/

export default createTransformer((fileInfo, api, options, context) => {
  const { j, root } = context;

  root.find(j.MemberExpression, {
    property: { type: 'Identifier', name: 'reasoning' },
  }).forEach(path => {
    path.node.property.name = 'reasoningText';
    context.hasChanges = true;
  });
});
