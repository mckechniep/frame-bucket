import type { Metadata } from 'next';
import './globals.css';

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
      <body>{children}</body>
    </html>
  );
}
