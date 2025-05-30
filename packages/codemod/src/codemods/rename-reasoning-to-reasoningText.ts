import { createTransformer } from './lib/create-transformer';

/*
TODO: describe what the codemod does
*/

export default createTransformer((fileInfo, api, options, context) => {
  const { j, root } = context;

    // Collect names of variables that are assigned `steps` from `generateText`
  const stepsIdentifiers = new Set();

  // Step 1: Find destructuring from `generateText()`
  root.find(j.VariableDeclarator, {
    id: { type: 'ObjectPattern' },
    init: { type: 'AwaitExpression' },
  })
  .filter(path => {
    const awaitExpr = path.node.init;
    const callee = awaitExpr.argument.callee;
    return (
      callee &&
      ((callee.type === 'Identifier' && callee.name === 'generateText') ||
       (callee.type === 'MemberExpression' && callee.property.name === 'generateText'))
    );
  })
  .forEach(path => {
    path.node.id.properties.forEach(prop => {
      if (prop.key.name === 'steps') {
        stepsIdentifiers.add(prop.value.name); // usually 'steps'
      }
    });
  });

  if (stepsIdentifiers.size === 0) return null;

  // Step 2: Look for for-loops that iterate over `steps`
  root.find(j.ForOfStatement)
    .filter(path => {
      const right = path.node.right;
      return right.type === 'Identifier' && stepsIdentifiers.has(right.name);
    })
    .forEach(path => {
      const stepVar = path.node.left;
      let stepName = null;

      if (stepVar.type === 'VariableDeclaration') {
        const decl = stepVar.declarations[0];
        if (decl.id.type === 'Identifier') {
          stepName = decl.id.name;
        }
      } else if (stepVar.type === 'Identifier') {
        stepName = stepVar.name;
      }

      if (!stepName) return;

      // Step 3: Rename `.reasoning` to `.reasoningText` inside this loop
      j(path)
        .find(j.MemberExpression, {
          object: { type: 'Identifier', name: stepName },
          property: { type: 'Identifier', name: 'reasoning' },
        })
        .forEach(memberPath => {
          memberPath.node.property.name = 'reasoningText';
          context.hasChanges = true; // Mark that changes were made
        });
    });
});
