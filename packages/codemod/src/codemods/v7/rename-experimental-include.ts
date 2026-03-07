import { createTransformer } from '../lib/create-transformer';

export default createTransformer((fileInfo, api, options, context) => {
  const { j, root } = context;

  let hasChanges = false;

  // AI methods that accept the include option
  const aiMethods = ['generateText', 'streamText'];

  // Find AI method calls and rename experimental_include to include
  root.find(j.CallExpression).forEach(path => {
    const { callee, arguments: args } = path.node;

    // Check if this is an AI method call
    if (
      callee.type === 'Identifier' &&
      aiMethods.includes(callee.name) &&
      args.length > 0
    ) {
      const firstArg = args[0];

      // The first argument should be an object with properties
      if (firstArg.type === 'ObjectExpression') {
        firstArg.properties.forEach(prop => {
          const isPropertyType =
            prop.type === 'Property' || prop.type === 'ObjectProperty';

          if (isPropertyType && prop.key && prop.key.type === 'Identifier') {
            if (prop.key.name === 'experimental_include') {
              prop.key.name = 'include';
              hasChanges = true;
            }
          }
        });
      }
    }
  });

  if (hasChanges) {
    context.hasChanges = true;
  }
});
