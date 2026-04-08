import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/context/auth-context';
import { NotificationProvider } from '@/context/notification-context';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'ChatGPT App',
  description: 'Chat with OpenAI GPT models',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          <NotificationProvider>{children}</NotificationProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
