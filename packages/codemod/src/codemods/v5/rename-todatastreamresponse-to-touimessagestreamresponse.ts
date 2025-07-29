import { createTransformer } from '../lib/create-transformer';

export default createTransformer((fileInfo, api, options, context) => {
  const { j, root } = context;

  // Replace method calls: result.toDataStreamResponse() -> result.toUIMessageStreamResponse()
  root
    .find(j.CallExpression)
    .filter(path => {
      return (
        path.node.callee.type === 'MemberExpression' &&
        path.node.callee.property.type === 'Identifier' &&
        path.node.callee.property.name === 'toDataStreamResponse'
      );
    })
    .forEach(path => {
      if (
        path.node.callee.type === 'MemberExpression' &&
        path.node.callee.property.type === 'Identifier'
      ) {
        path.node.callee.property.name = 'toUIMessageStreamResponse';
        context.hasChanges = true;
      }
    });

  // Replace standalone function references (if they exist)
  root
    .find(j.Identifier)
    .filter(path => {
      // Only replace identifiers that are not property names in member expressions
      const parent = path.parent;
      return (
        path.node.name === 'toDataStreamResponse' &&
        parent.node.type !== 'ImportSpecifier' &&
        !(
          parent.node.type === 'MemberExpression' &&
          parent.node.property === path.node
        ) &&
        !(parent.node.type === 'Property' && parent.node.key === path.node) &&
        !(
          parent.node.type === 'ObjectProperty' && parent.node.key === path.node
        )
      );
    })
    .forEach(path => {
      path.node.name = 'toUIMessageStreamResponse';
      context.hasChanges = true;
    });
});
