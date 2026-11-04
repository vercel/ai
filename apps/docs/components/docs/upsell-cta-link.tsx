'use client';

import { track } from '@vercel/analytics/react';
import Link from 'next/link';

const TARGET_URL =
  'https://vercel.com/signup?utm_source=ai-sdk_site&utm_medium=docs_card&utm_content=sign-up';

/** The upsell card's tracked call-to-action (the card itself is server-rendered). */
export const UpsellCtaLink = () => (
  <Link
    className="inline-flex w-full items-center justify-center rounded-md bg-gray-1000 px-4 py-2 font-medium text-background-100 transition-opacity hover:opacity-90"
    href={TARGET_URL}
    onClick={() => {
      track('upsell_cta_click', {
        click_type: 'button',
        location: 'Upsell',
        click_text: 'Sign Up',
        target_url: TARGET_URL,
      });
    }}
    rel="noopener noreferrer"
    target="_blank"
  >
    Sign Up
  </Link>
);
