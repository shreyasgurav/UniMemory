import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'UniMemory',
  description: 'Your personal memory layer - View, search, and manage your memories',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  )
}
