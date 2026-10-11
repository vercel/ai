import { createTransformer } from '../lib/create-transformer';

function getStaticPropertyName(
  node: any,
  computed: boolean | undefined,
): string | undefined {
  if (node?.type === 'Identifier') {
    return computed ? undefined : node.name;
  }
  if (node?.type === 'Literal' || node?.type === 'StringLiteral') {
    return typeof node.value === 'string' ? node.value : undefined;
  }
}

function setName(node: any, name: string) {
  if (node.type === 'Identifier') {
    node.name = name;
  } else if (node.type === 'Literal' || node.type === 'StringLiteral') {
    node.value = name;
  }
}

export default createTransformer((fileInfo, api, options, context) => {
  const { j, root } = context;

  root.find(j.ObjectExpression).forEach(path => {
    path.node.properties.forEach(property => {
      if (
        (property.type === 'Property' || property.type === 'ObjectProperty') &&
        getStaticPropertyName(property.key, property.computed) === 'system'
      ) {
        setName(property.key, 'instructions');
        context.hasChanges = true;
      }
    });
  });

  root.find(j.ObjectPattern).forEach(path => {
    path.node.properties.forEach((property: any) => {
      if (
        (property.type === 'Property' || property.type === 'ObjectProperty') &&
        getStaticPropertyName(property.key, property.computed) === 'system'
      ) {
        if (property.shorthand) {
          property.shorthand = false;
          property.value = j.identifier('system');
        }
        setName(property.key, 'instructions');
        context.hasChanges = true;
      }
    });
  });

  root.find(j.MemberExpression).forEach(path => {
    if (
      getStaticPropertyName(path.node.property, path.node.computed) === 'system'
    ) {
      setName(path.node.property, 'instructions');
      context.hasChanges = true;
    }
  });
});
