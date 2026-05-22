import type { Metadata } from 'next';
import { IBM_Plex_Sans, IBM_Plex_Serif, JetBrains_Mono, Zen_Dots } from 'next/font/google';

import './globals.css';

// Display: IBM Plex Serif. Editorial headlines and titling. Pairs by
// design with Plex Sans — same family geometry, complementary roles.
// Replaces Newsreader (which replaced Fraunces) as the codebase converges
// on a single coherent type system instead of one-off display swaps.
const plexSerif = IBM_Plex_Serif({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-display',
  display: 'swap',
});

// Body: IBM Plex Sans. The workhorse face — characterful Bauhaus-meets-
// corporate-modern geometry, designed by IBM for system-scale UI text.
// Open apertures, calm rhythm at body sizes, no loud personality competing
// with the editorial display face above.
const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-body',
  display: 'swap',
});

// Mono: JetBrains Mono. Variable, single-file, designed for IDE legibility.
// Used for tabular numerics ($-amounts, view counts, timestamps), code-like
// labels, and the token fragments on /shares.
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

// Brand mark: Zen Dots. Reserved EXCLUSIVELY for the "Frame Bucket"
// wordmark in the wizard nav top-left. Strong geometric-dot personality —
// applied surgically to one surface to act as a brand accent, not the
// general display stack. If it gets stretched to UI headlines the whole
// app starts reading as arcade/retro-tech, which fights the editorial
// direction Plex Serif establishes elsewhere.
const zenDots = Zen_Dots({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-brand',
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
      <body
        className={`${plexSerif.variable} ${plexSans.variable} ${jetbrainsMono.variable} ${zenDots.variable}`}
      >
        {children}
      </body>
    </html>
  );
}
