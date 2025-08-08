import { createTransformer } from '../lib/create-transformer';

export default createTransformer((fileInfo, api, options, context) => {
  const { j, root } = context;

  // Find member expressions that match: delta.textDelta
  root
    .find(j.MemberExpression)
    .filter(path => {
      const node = path.node;

      // Must be accessing a property called 'textDelta'
      if (
        !j.Identifier.check(node.property) ||
        node.property.name !== 'textDelta'
      ) {
        return false;
      }

      // The object must be an identifier called 'delta'
      if (!j.Identifier.check(node.object) || node.object.name !== 'delta') {
        return false;
      }

      return true;
    })
    .forEach(path => {
      // Replace delta.textDelta with delta.text
      const newMemberExpression = j.memberExpression(
        path.node.object, // delta
        j.identifier('text'), // text
      );

      path.replace(newMemberExpression);
      context.hasChanges = true;
    });

  // Replace the case 'text-delta' with case 'text'
  root
    .find(j.SwitchCase)
    .filter(path => {
      const node = path.node;

      // Check if the test is a string literal with value 'text-delta'
      if (j.Literal.check(node.test) && node.test.value === 'text-delta') {
        return true;
      }

      return false;
    })
    .forEach(path => {
      // Replace 'text-delta' with 'text'
      path.node.test = j.literal('text');
      context.hasChanges = true;
    });

  // Replace string literal 'text-delta' with 'text' in direct comparisons
  root
    .find(j.Literal)
    .filter(path => {
      const node = path.node;
      return node.value === 'text-delta';
    })
    .forEach(path => {
      // Replace 'text-delta' with 'text'
      path.node.value = 'text';
      context.hasChanges = true;
    });
});
