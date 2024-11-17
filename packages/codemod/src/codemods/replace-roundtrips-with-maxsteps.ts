import { API, FileInfo } from 'jscodeshift';

export default function transformer(file: FileInfo, api: API) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let hasChanges = false;

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

      let maxStepsValue = 1;
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
            maxStepsValue = prop.value.value + 1;
          }
          return false; // Remove the property
        }
        return true;
      });

      if (foundRoundtrips) {
        hasChanges = true;
        optionsArg.properties.push(
          j.objectProperty(
            j.identifier('maxSteps'),
            j.numericLiteral(maxStepsValue),
          ),
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
        hasChanges = true;
        path.node.property.name = 'steps';
      }
    });

  return hasChanges ? root.toSource() : null;
}
