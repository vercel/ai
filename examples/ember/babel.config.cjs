/**
 * Compiles the gts components of the app.
 */
const { buildMacros } = require('@embroider/macros/babel');

const macros = buildMacros();

module.exports = {
  plugins: [
    [
      '@babel/plugin-transform-typescript',
      {
        allExtensions: true,
        allowDeclareFields: true,
        onlyRemoveTypeImports: true,
      },
    ],
    [
      'babel-plugin-ember-template-compilation',
      {
        transforms: macros.templateMacros,
      },
    ],
  ].concat(macros.babelMacros),

  generatorOpts: {
    compact: false,
  },
};
