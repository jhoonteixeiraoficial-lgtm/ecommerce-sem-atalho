import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "E-commerce Sem Atalho | Aprenda a Vender no Mercado Livre",
    template: "%s | E-commerce Sem Atalho",
  },
  description: "O ecossistema completo que ensina pessoas comuns a criarem um negócio lucrativo no Mercado Livre. Curso, IA, comunidade ativa e suporte.",
  keywords: ["mercado livre", "e-commerce", "vender online", "curso", "negócio online", "renda extra"],
  authors: [{ name: "E-commerce Sem Atalho" }],
  creator: "Jonatha Teixeira",
  metadataBase: new URL("https://www.ecommercesematalho.com.br"),
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "E-commerce Sem Atalho",
    title: "E-commerce Sem Atalho | Aprenda a Vender no Mercado Livre",
    description: "O ecossistema completo que ensina pessoas comuns a criarem um negócio lucrativo no Mercado Livre.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "E-commerce Sem Atalho",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "E-commerce Sem Atalho | Aprenda a Vender no Mercado Livre",
    description: "O ecossistema completo que ensina pessoas comuns a criarem um negócio lucrativo no Mercado Livre.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${inter.variable} h-full antialiased`}
    >
      <head>
        <link rel="icon" href="/logo-icon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <meta name="theme-color" content="#0c0c0c" />
      </head>
      <body className="min-h-full flex flex-col bg-bg text-text-primary">{children}</body>
    </html>
  );
}
