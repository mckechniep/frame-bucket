import type { Metadata } from 'next';
import { Newsreader, Hanken_Grotesk } from 'next/font/google';

import './globals.css';

// Display: Newsreader. Variable editorial serif with optical sizing — same
// technical role Fraunces filled, but sober proportions in place of Fraunces'
// soft-warmth wobble. Designed by Production Type for digital editorial use;
// reads with quiet gravitas at headline sizes without the curvy character
// that polarises Fraunces.
const newsreader = Newsreader({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

// Body: Hanken Grotesk. Variable Bauhaus-influenced grotesk with real
// character at body sizes — open apertures, geometric but not sterile.
// Pairs intentionally with Fraunces' optical-sizing warmth (serif gravitas
// in headlines, grotesk precision in body) for a Swiss/editorial direction.
// Chosen over Inter, which the project's own design-quality rules flag as
// generic AI default.
const hankenGrotesk = Hanken_Grotesk({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Frame Bucket',
  description: 'Build a site from a layered design recipe.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${newsreader.variable} ${hankenGrotesk.variable}`}>{children}</body>
    </html>
  );
}
