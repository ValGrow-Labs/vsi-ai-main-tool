import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";

const geist = Geist({
 variable: "--font-geist",
 subsets: ["latin"],
 display: "swap",
});

const geistMono = Geist_Mono({
 variable: "--font-geist-mono",
 subsets: ["latin"],
 display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export const metadata: Metadata = {
 title: { default: "VSI Search Intelligence", template: "%s | VSI" },
 description: "Enterprise AI Search Intelligence & Citation Analytics Platform",
 icons: { icon: "/logo.png" },
 robots: {
 index: false,
 follow: false,
 nocache: true,
 googleBot: { index: false, follow: false, noimageindex: true },
 },
 referrer: "strict-origin-when-cross-origin",
 generator: "SearchIntel",
 applicationName: "SearchIntel",
 authors: [{ name: "SearchIntel" }],
};

export default function RootLayout({
 children,
}: Readonly<{
 children: React.ReactNode;
}>) {
 return (
 <html
 lang="en"
 className={`${geist.variable} ${geistMono.variable} h-full antialiased`}
 suppressHydrationWarning
 >
 <body className="min-h-full flex flex-col font-sans bg-background text-foreground" suppressHydrationWarning>
 <ThemeProvider>
 {children}
 </ThemeProvider>
 </body>
 </html>
 );
}
