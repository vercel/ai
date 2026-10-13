import { createTransformer } from '../lib/create-transformer';

export default createTransformer((fileInfo, api, options, context) => {
  const { j, root } = context;

  // Methods that return objects with rawResponse
  const aiMethods = [
    'embed',
    'embedMany',
    'generateText',
    'generateObject',
    'streamObject',
    'streamText',
  ];

  // Track variable names that store results from AI methods
  const aiResultVariables = new Set<string>();

  // Find variable declarations from AI method calls
  root.find(j.VariableDeclarator).forEach(path => {
    const { id, init } = path.node;

    // Handle await AI method calls
    if (
      init &&
      init.type === 'AwaitExpression' &&
      init.argument &&
      init.argument.type === 'CallExpression' &&
      init.argument.callee.type === 'Identifier' &&
      aiMethods.includes(init.argument.callee.name)
    ) {
      if (id.type === 'Identifier') {
        aiResultVariables.add(id.name);
      } else if (id.type === 'ObjectPattern') {
        id.properties.forEach(prop => {
          if (
            (prop.type === 'Property' || prop.type === 'ObjectProperty') &&
            prop.key.type === 'Identifier' &&
            prop.key.name === 'rawResponse'
          ) {
            prop.key.name = 'response';
            if (prop.shorthand) {
              prop.shorthand = false;
            }
            context.hasChanges = true;
          }
        });
      }
    }

    // Handle non-await streaming method calls
    if (
      init &&
      init.type === 'CallExpression' &&
      init.callee.type === 'Identifier' &&
      ['streamObject', 'streamText'].includes(init.callee.name)
    ) {
      if (id.type === 'Identifier') {
        aiResultVariables.add(id.name);
      } else if (id.type === 'ObjectPattern') {
        id.properties.forEach(prop => {
          if (
            (prop.type === 'Property' || prop.type === 'ObjectProperty') &&
            prop.key.type === 'Identifier' &&
            prop.key.name === 'rawResponse'
          ) {
            prop.key.name = 'response';
            if (prop.shorthand) {
              prop.shorthand = false;
            }
            context.hasChanges = true;
          }
        });
      }
    }
  });

  // Find assignment expressions from AI method calls
  root.find(j.AssignmentExpression).forEach(path => {
    const { left, right } = path.node;

    // Handle await AI method calls
    if (
      right.type === 'AwaitExpression' &&
      right.argument &&
      right.argument.type === 'CallExpression' &&
      right.argument.callee.type === 'Identifier' &&
      aiMethods.includes(right.argument.callee.name)
    ) {
      if (left.type === 'Identifier') {
        aiResultVariables.add(left.name);
      }
    }

    // Handle non-await streaming method calls
    if (
      right.type === 'CallExpression' &&
      right.callee.type === 'Identifier' &&
      ['streamObject', 'streamText'].includes(right.callee.name)
    ) {
      if (left.type === 'Identifier') {
        aiResultVariables.add(left.name);
      }
    }
  });

  // Transform member expressions accessing .rawResponse on AI result variables
  root.find(j.MemberExpression).forEach(path => {
    const { object, property } = path.node;

    if (property.type === 'Identifier' && property.name === 'rawResponse') {
      // Direct access: variable.rawResponse
      if (object.type === 'Identifier' && aiResultVariables.has(object.name)) {
        context.hasChanges = true;
        property.name = 'response';
      }

      // Nested access: something.rawResponse where something might be an AI result
      let currentObj = object;
      while (currentObj.type === 'MemberExpression') {
        currentObj = currentObj.object;
      }

      if (
        currentObj.type === 'Identifier' &&
        aiResultVariables.has(currentObj.name)
      ) {
        context.hasChanges = true;
        property.name = 'response';
      }
    }
  });
});
