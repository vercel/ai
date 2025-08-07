import { createTransformer } from '../lib/create-transformer';

export default createTransformer((fileInfo, api, options, context) => {
  const { j, root } = context;

  // Step 1: Find all variables assigned from generateText call
  const generateTextVars = new Set();

  // Variable declarations: const foo = await generateText(...)
  root
    .find(j.VariableDeclarator)
    .filter(path => {
      const init = path.node.init;
      if (!init) return false;

      if (j.AwaitExpression.check(init)) {
        if (
          j.CallExpression.check(init.argument) &&
          j.Identifier.check(init.argument.callee) &&
          init.argument.callee.name === 'generateText'
        ) {
          return true;
        }
      }

      return false;
    })
    .forEach(path => {
      if (j.Identifier.check(path.node.id)) {
        generateTextVars.add(path.node.id.name);
      }
    });

  // Assignment expressions: foo = await generateText(...)
  root
    .find(j.AssignmentExpression)
    .filter(path => {
      const right = path.node.right;
      if (!right) return false;
      if (j.AwaitExpression.check(right)) {
        if (
          j.CallExpression.check(right.argument) &&
          j.Identifier.check(right.argument.callee) &&
          right.argument.callee.name === 'generateText'
        ) {
          return true;
        }
      }

      return false;
    })
    .forEach(path => {
      if (j.Identifier.check(path.node.left)) {
        generateTextVars.add(path.node.left.name);
      }
    });

  // Step 2: Find .text usage on those variables
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
      // Ensure .text is not being called as a function (i.e., not result.text(...))
      if (
        path.parentPath &&
        j.CallExpression.check(path.parentPath.node) &&
        path.parentPath.node.callee === node
      ) {
        return false;
      }
      return generateTextVars.has(node.object.name);
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
