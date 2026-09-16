import { notFound } from 'next/navigation';
// oxlint-disable-next-line no-namespace -- Next.js generates root parameter getters on this module.
import * as root from 'next/root-params';

export const getRootLang = async () => (await root.lang()) ?? notFound();
