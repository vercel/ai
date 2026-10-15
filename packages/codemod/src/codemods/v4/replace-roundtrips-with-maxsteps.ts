import type { JSCodeshift, ObjectProperty } from 'jscodeshift';
import { createTransformer } from '../lib/create-transformer';

type ExpressionKind = Parameters<JSCodeshift['binaryExpression']>[1];

function isExpression(node: ObjectProperty['value']): node is ExpressionKind {
  return !node.type.endsWith('Pattern') && node.type !== 'RestElement';
}

export default createTransformer((fileInfo, api, options, context) => {
  const { j, root } = context;

  root
    .find(j.CallExpression)
    .filter(
      path =>
        path.node.callee.type === 'Identifier' &&
        ['generateText', 'streamText'].includes(path.node.callee.name),
    )
    .forEach(path => {
      const optionsArg = path.node.arguments[0];
      if (optionsArg?.type !== 'ObjectExpression') return;

      let maxStepsValue: ExpressionKind = j.numericLiteral(1);
      let foundRoundtrips = false;

      optionsArg.properties = optionsArg.properties.filter(prop => {
        if (
          prop.type === 'ObjectProperty' &&
          prop.key.type === 'Identifier' &&
          ['maxToolRoundtrips', 'maxAutomaticRoundtrips'].includes(
            prop.key.name,
          )
        ) {
          foundRoundtrips = true;
          if (prop.value.type === 'NumericLiteral') {
            maxStepsValue = j.numericLiteral(prop.value.value + 1);
          } else if (isExpression(prop.value)) {
            // Keep a non-literal limit and add the extra step at runtime,
            // so `maxToolRoundtrips: rounds` becomes `maxSteps: rounds + 1`.
            maxStepsValue = j.binaryExpression(
              '+',
              prop.value,
              j.numericLiteral(1),
            );
          }
          return false; // Remove the property
        }
        return true;
      });

      if (foundRoundtrips) {
        context.hasChanges = true;
        optionsArg.properties.push(
          j.objectProperty(j.identifier('maxSteps'), maxStepsValue),
        );
      }
    });

  // Replace property access
  root
    .find(j.MemberExpression)
    .filter(
      path =>
        path.node.property.type === 'Identifier' &&
        path.node.property.name === 'roundtrips',
    )
    .forEach(path => {
      if (path.node.property.type === 'Identifier') {
        context.hasChanges = true;
        path.node.property.name = 'steps';
      }
    });
});
