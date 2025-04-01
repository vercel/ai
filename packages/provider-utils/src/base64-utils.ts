/**
 * Converts an image URL to a base64 string.
 * @param imageUrl - The URL of the image to convert.
 * @returns A promise that resolves to the base64 string.
 */
export async function convertImageUrlToBase64(imageUrl: string) {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch the image from the URL: ${imageUrl}`);
    }
    const arrayBuffer = await response.arrayBuffer()
    const base64URL = Buffer.from(arrayBuffer).toString("base64")
    return base64URL
  } catch (error) {
    throw new Error(`Failed to convert the image URL to a base64 string: ${error}`);
  }
}
