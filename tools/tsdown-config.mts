export const tsdownBaseConfig = {
  format: ['esm'] as ['esm'],
  target: 'es2022' as const,
  tsconfig: 'tsconfig.build.json',
  dts: true,
  sourcemap: true,
  fixedExtension: false,
};
