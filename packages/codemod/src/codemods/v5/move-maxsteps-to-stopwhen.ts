import { createTransformer } from '../lib/create-transformer';

export default createTransformer((fileInfo, api, options, context) => {
  const { j, root } = context;
  let shouldAddStepCountIsImport = false;
  let hasStepCountIsImport = false;

  root
    .find(j.ImportDeclaration)
    .filter(path => path.node.source.value === 'ai')
    .forEach(path => {
      if (
        path.node.specifiers?.some(
          s =>
            s.type === 'ImportSpecifier' && s.imported.name === 'stepCountIs',
        )
      ) {
        hasStepCountIsImport = true;
      }
    });

  function transformObjectExpression(objExpr: any) {
    if (
      !objExpr ||
      objExpr.type !== 'ObjectExpression' ||
      !Array.isArray(objExpr.properties)
    )
      return false;
    const maxStepsPropIdx = objExpr.properties.findIndex(
      (prop: any) =>
        j.Property.check(prop) &&
        ((j.Identifier.check(prop.key) && prop.key.name === 'maxSteps') ||
          (j.StringLiteral.check(prop.key) && prop.key.value === 'maxSteps')),
    );
    if (maxStepsPropIdx === -1) return false;
    const maxStepsProp = objExpr.properties[maxStepsPropIdx];
    if (
      !j.Property.check(maxStepsProp) ||
      (!j.Literal.check(maxStepsProp.value) &&
        !j.Identifier.check(maxStepsProp.value) &&
        !j.BinaryExpression.check(maxStepsProp.value))
    ) {
      return false;
    }
    const stopWhenProp = j.property(
      'init',
      j.identifier('stopWhen'),
      j.callExpression(j.identifier('stepCountIs'), [maxStepsProp.value]),
    );
    objExpr.properties.splice(maxStepsPropIdx, 1, stopWhenProp);
    shouldAddStepCountIsImport = true;
    context.hasChanges = true;
    return true;
  }

  root.find(j.CallExpression).forEach(callPath => {
    const callee = callPath.node.callee;
    let fnName: string | null = null;
    if (j.Identifier.check(callee)) {
      fnName = callee.name;
    } else if (
      j.MemberExpression.check(callee) &&
      j.Identifier.check(callee.property)
    ) {
      fnName = callee.property.name;
    }
    if (!fnName) return;

    // TODO: Handle cases where the function is aliased
    if (!['generateText', 'streamText'].includes(fnName)) return;

    const objArgIdx = callPath.node.arguments.findIndex(arg =>
      j.ObjectExpression.check(arg),
    );
    if (objArgIdx === 0) {
      const objArg = callPath.node.arguments[objArgIdx];
      transformObjectExpression(objArg);
      return;
    }

    // If first argument is an identifier
    const firstArg = callPath.node.arguments[0];
    if (j.Identifier.check(firstArg)) {
      const varName = firstArg.name;

      let found = false;
      root
        .find(j.VariableDeclarator, { id: { name: varName } })
        .forEach(varPath => {
          if (found) return;

          if (j.ObjectExpression.check(varPath.node.init)) {
            if (transformObjectExpression(varPath.node.init)) {
              found = true;
            }
          }
        });
      if (found) return;

      root
        .find(j.AssignmentExpression, {
          left: { type: 'Identifier', name: varName },
        })
        .forEach(assignPath => {
          if (j.ObjectExpression.check(assignPath.node.right)) {
            transformObjectExpression(assignPath.node.right);
          }
        });
    }
  });

  // Add stepCountIs to existing `ai` or create new import if needed
  if (shouldAddStepCountIsImport && !hasStepCountIsImport) {
    const aiImport = root
      .find(j.ImportDeclaration)
      .filter(path => path.node.source.value === 'ai');

    if (aiImport.size()) {
      const path = aiImport.get();
      const specifiers = path.node.specifiers;
      const alreadyImported = specifiers?.some(
        (s: any) =>
          s.type === 'ImportSpecifier' && s.imported.name === 'stepCountIs',
      );
      if (!alreadyImported) {
        specifiers.push(j.importSpecifier(j.identifier('stepCountIs')));
        path.node.specifiers = specifiers;
      }
    } else {
      const firstImport = root.find(j.ImportDeclaration).at(-1);
      const importDecl = j.importDeclaration(
        [j.importSpecifier(j.identifier('stepCountIs'))],
        j.literal('ai'),
      );
      if (firstImport.size()) {
        firstImport.insertAfter(importDecl);
      } else {
        root.get().node.program.body.unshift(importDecl);
      }
    }
    context.hasChanges = true;
  }
});
