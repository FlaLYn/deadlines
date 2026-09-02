import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import './management.css';

const siteUrl = 'https://courseflow-syllabus-planner.tuk-tuk.chatgpt.site';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'Courseflow — turn syllabi into a plan',
  description: 'Import a syllabus and get an organized course calendar in seconds.',
  openGraph: {
    title: 'Courseflow',
    description: 'Turn syllabi into a plan.',
    type: 'website',
    url: siteUrl,
    images: [{ url: `${siteUrl}/og.png`, width: 1731, height: 909, alt: 'Courseflow — Turn syllabi into a plan' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Courseflow',
    description: 'Turn syllabi into a plan.',
    images: [`${siteUrl}/og.png`],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
