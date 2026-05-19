import type { Metadata } from 'next';
import { Fraunces, Inter } from 'next/font/google';

import './globals.css';

// Display: Fraunces. Editorial serif with optical sizing — used for headlines
// across the wizard and admin surfaces. Variable axes load automatically.
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

// Body: Inter. Clean sans, the canonical body pairing for Fraunces per the
// editorial craft canon.
const inter = Inter({
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
      <body className={`${fraunces.variable} ${inter.variable}`}>{children}</body>
    </html>
  );
}
