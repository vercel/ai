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

    // TODO: Handle cases where the function is aliased or obj is defined elsewhere then passed in
    if (!['generateText', 'streamText'].includes(fnName)) return;

    const objArgIdx = callPath.node.arguments.findIndex(arg =>
      j.ObjectExpression.check(arg),
    );
    if (objArgIdx !== 0) return;
    const objArg = callPath.node.arguments[objArgIdx];
    if (
      !objArg ||
      objArg.type !== 'ObjectExpression' ||
      !Array.isArray(objArg.properties)
    )
      return;

    const maxStepsPropIdx = objArg.properties.findIndex(
      prop =>
        j.Property.check(prop) &&
        ((j.Identifier.check(prop.key) && prop.key.name === 'maxSteps') ||
          (j.StringLiteral.check(prop.key) && prop.key.value === 'maxSteps')),
    );

    if (maxStepsPropIdx === -1) return;
    const maxStepsProp = objArg.properties[maxStepsPropIdx];

    if (
      !j.Property.check(maxStepsProp) ||
      (!j.Literal.check(maxStepsProp.value) &&
        !j.Identifier.check(maxStepsProp.value) &&
        !j.BinaryExpression.check(maxStepsProp.value))
    ) {
      return;
    }

    const stopWhenProp = j.property(
      'init',
      j.identifier('stopWhen'),
      j.callExpression(j.identifier('stepCountIs'), [maxStepsProp.value]),
    );
    objArg.properties.splice(maxStepsPropIdx, 1, stopWhenProp);
    shouldAddStepCountIsImport = true;
    context.hasChanges = true;
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
