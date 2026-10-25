import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker";
import { themeBootScript } from "@/lib/theme";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin", "latin-ext"],
});
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "RadaStudentów24",
  description: "System obsługi posiedzeń samorządu studenckiego",
  applicationName: "RadaStudentów24",
  appleWebApp: {
    capable: true,
    title: "Rada24",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  // Status bar / browser chrome follows the system theme (see theme.css).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0d" },
  ],
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // lets the app paint under the notch; layouts pad with safe-area insets
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl" className={`${geist.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="min-h-full bg-zinc-950 text-zinc-100 font-sans">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
