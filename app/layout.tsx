// app/layout.tsx
import type { Metadata, Viewport } from "next";
import { Roboto } from "next/font/google"; 
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";

const roboto = Roboto({ 
  subsets: ["latin"], 
  weight: ["300", "400", "500", "700"],
  variable: "--font-roboto",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, // Impede do layout quebrar ao focar no input
};

export const metadata: Metadata = {
  title: "LicitaSaaS — Orçamentação e Propostas de Licitações",
  description: "Plataforma de Orçamentação e Propostas de Licitações de Obras Públicas (SINAPI / GOINFRA / Lei 14.133/2021)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${roboto.variable} font-sans antialiased`}>
        {children}
        <Toaster />
        <SonnerToaster richColors position="top-right" />
      </body>
    </html>
  );
}