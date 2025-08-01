export async function ignoredResponseText() {
    const response = {text: 'hi'};
    console.log(response.text);

    const response2 = await fetch('https://vercel.com');
    await response2.text()
}