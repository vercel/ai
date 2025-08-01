export async function ignoredResponseText() {
    const response = {text: 'hi'};
    console.log(response.text);

    const result = await fetch('https://vercel.com');
    await result.text()
}