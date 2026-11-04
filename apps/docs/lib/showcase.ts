/**
 * Products and projects on the /resources/showcase page (ported from the
 * legacy ai-sdk.dev app).
 */
export interface ShowcaseProject {
  name: string;
  image: string;
  link: string;
}

export const showcaseProjects: ShowcaseProject[] = [
  {
    name: 'Perplexity',
    image: 'perplexity.png',
    link: 'https://perplexity.ai',
  },
  {
    name: 'v0',
    image: 'v0.png',
    link: 'https://v0.dev/chat',
  },
  {
    name: 'Postgres.new',
    // The legacy app references postgresnew.png, which never existed; this
    // screenshot (the same tool, renamed database.build by Supabase) shipped
    // unreferenced in the legacy asset set.
    image: 'databasebuild.png',
    link: 'https://postgres.new',
  },
  {
    name: 'Midday',
    image: 'midday.png',
    link: 'https://www.midday.ai',
  },
  {
    name: 'Val Town',
    image: 'valtown.png',
    link: 'https://val.town',
  },
  {
    name: 'Morphic',
    link: 'https://morphic.sh',
    image: 'morphic.png',
  },
  {
    name: 'Dub.sh',
    link: 'https://dub.sh',
    image: 'dubsh.png',
  },
  {
    name: 'Chatbase',
    link: 'https://chatbase.co',
    image: 'chatbase.png',
  },
  {
    name: 'ChatPRD',
    link: 'https://www.chatprd.ai',
    image: 'chatprd.png',
  },
  {
    name: 'Ozone',
    link: 'https://ozone.pro',
    image: 'ozone.png',
  },
  {
    name: '2txt',
    link: 'https://2txt.vercel.app',
    image: '2txt.png',
  },
  {
    name: 'Vercel AI templates',
    link: 'https://vercel.com/templates?type=ai',
    image: 'templates.png',
  },
];
