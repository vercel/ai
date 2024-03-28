export const getQueryParam = (name: string) => {
  if (typeof window !== "undefined") {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
  }
  return null
}