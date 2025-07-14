import { createTransformer } from '../lib/create-transformer';

export default createTransformer((fileInfo, api, options, context) => {
  const { j, root } = context;

  // Find member expressions that match: result.text, result1.text, result2.text, etc.
  // where result is an identifier (not already a member expression)
  root
    .find(j.MemberExpression)
    .filter(path => {
      const node = path.node;

      // Must be accessing a property called 'text'
      if (!j.Identifier.check(node.property) || node.property.name !== 'text') {
        return false;
      }

      // The object must be a simple identifier (not a member expression)
      if (!j.Identifier.check(node.object)) {
        return false;
      }

      // The identifier should be a common generateText result variable name
      const commonNames = [
        'result',
        'response',
        'output',
        'data',
        'textResult',
      ];
      const objName = node.object.name;
      return commonNames.includes(objName) || objName.startsWith('result');
    })
    .forEach(path => {
      // Transform result.text to result.text.text by creating a new member expression
      // and setting the object to be the current member expression
      const newMemberExpression = j.memberExpression(
        path.node,
        j.identifier('text'),
      );

      // Replace the entire member expression with the new nested one
      path.replace(newMemberExpression);
      context.hasChanges = true;
    });
});
