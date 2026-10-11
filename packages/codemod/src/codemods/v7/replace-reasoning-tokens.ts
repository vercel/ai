import { createTransformer } from '../lib/create-transformer';

export default createTransformer((fileInfo, api, options, context) => {
  const { j, root } = context;

  root
    .find(j.MemberExpression, {
      property: { type: 'Identifier', name: 'reasoningTokens' },
    })
    .forEach(path => {
      if (
        j.MemberExpression.check(path.node.object) &&
        !path.node.object.computed &&
        j.Identifier.check(path.node.object.property) &&
        path.node.object.property.name === 'outputTokenDetails'
      ) {
        return;
      }

      j(path).replaceWith(
        j.memberExpression(
          j.memberExpression(
            path.node.object,
            j.identifier('outputTokenDetails'),
          ),
          j.identifier('reasoningTokens'),
        ),
      );
      context.hasChanges = true;
    });
});
