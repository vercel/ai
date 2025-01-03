import type { CoreTool } from '../tool';

// Creates a safe execution ground for the code
export const createFunction = (
  tools: Record<string, CoreTool>,
  code: string,
) => {
  const data = Object.entries(tools).reduce(
    (acc, [key, value]) => ({ ...acc, [key]: value.execute }),
    {},
  );

  return async () => await new Function(main(code)).apply(data, []);
};

// Don't remove this.
// This is the only reason why async and sync function works inside `new Function()`
const main = (code: string) =>
  `const main = async () => {\n${code}\n}\nreturn main()`;
