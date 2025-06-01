import { createTransformer } from './lib/create-transformer';

/*
`steps[].reasoning` is renamed to `steps[].reasoningText`
for `{steps}` destructured from `generateText()`.
*/

export default createTransformer((fileInfo, api, options, context) => {
  const { j, root } = context;

  // Collect names of variables that are assigned `steps` from `generateText`
  const stepsIdentifiers = new Set();

  // Step 1: Find destructuring from `generateText()`
  root
    .find(j.VariableDeclarator, {
      id: { type: 'ObjectPattern' },
      init: { type: 'AwaitExpression' },
    })
    .filter(path => {
      const awaitExpr = path.node.init;
      const callee = awaitExpr.argument.callee;
      return (
        callee &&
        ((callee.type === 'Identifier' && callee.name === 'generateText') ||
          (callee.type === 'MemberExpression' &&
            callee.property.name === 'generateText'))
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

  const pathsAndStepNames = [];

  // Step 2a: Look for `forEach` calls on `steps`
  root
    .find(j.CallExpression, {
      callee: {
        type: 'MemberExpression',
        property: {
          type: 'Identifier',
          name: 'forEach',
        },
      },
    })
    .filter(path => {
      const callee = path.node.callee;
      return (
        callee.object.type === 'Identifier' &&
        stepsIdentifiers.has(callee.object.name)
      );
    })
    .forEach(path => {
      const stepName = path.node.arguments[0].params[0].name;
      pathsAndStepNames.push({
        path,
        stepName,
      });
    });

  // Step 2b: Look for `for...of` loops on `steps`
  const forOfPaths = root
    .find(j.ForOfStatement)
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

      pathsAndStepNames.push({
        path,
        stepName,
      });
    })
    .filter(Boolean);

  // Step 3: Rename `reasoning` to `reasoningText` in the identified paths
  pathsAndStepNames.forEach(({ path, stepName }) => {
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
