export function mockId(): () => string {
  let counter = 0;
  return () => `id-${counter++}`;
}
