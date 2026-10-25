import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "RadaStudentów24",
  description: "System obsługi posiedzeń samorządu studenckiego",
  applicationName: "RadaStudentów24",
  appleWebApp: {
    capable: true,
    title: "Rada24",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  colorScheme: "dark",
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
    <html lang="pl" className={`${inter.variable} h-full antialiased dark`}>
      <body className="min-h-full bg-zinc-950 text-zinc-100 font-sans">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
