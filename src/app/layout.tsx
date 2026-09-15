import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Ecommerce Sem Atalho - Venda no Mercado Livre sem Atalhos",
    template: "%s | Ecommerce Sem Atalho",
  },
  description: "Comunidade e ferramentas de IA para criar anúncios otimizados no Mercado Livre. Pesquisa de mercado automatizada, copy baseada em dados, validação pré-publicação.",
  keywords: ["mercado livre", "ecommerce", "vender online", "ia", "anuncios otimizados", "copy", "pesquisa de mercado"],
  authors: [{ name: "Ecommerce Sem Atalho" }],
  creator: "Ecommerce Sem Atalho",
  publisher: "Ecommerce Sem Atalho",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://ecommerce-sem-atalho.com"),
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "Ecommerce Sem Atalho",
    title: "Ecommerce Sem Atalho - Venda no Mercado Livre sem Atalhos",
    description: "Comunidade e ferramentas de IA para criar anúncios otimizados no Mercado Livre.",
    images: [
      {
        url: "/og-default.png",
        width: 1200,
        height: 630,
        alt: "Ecommerce Sem Atalho",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Ecommerce Sem Atalho - Venda no Mercado Livre sem Atalhos",
    description: "Comunidade e ferramentas de IA para criar anúncios otimizados no Mercado Livre.",
    images: ["/og-default.png"],
    creator: "@ecommercesematalho",
    site: "@ecommercesematalho",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "default",
    "apple-mobile-web-app-title": "Ecommerce Sem Atalho",
    "format-detection": "telephone=no",
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon-16x16.png",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#0c0c0c",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${inter.variable} h-full antialiased`}>
      <head>
        <link rel="preconnect" href="https://api.mercadolibre.com" />
        <link rel="preconnect" href="https://http2.mlstatic.com" />
        <link rel="preconnect" href="https://generativelanguage.googleapis.com" />
        <link rel="icon" href="/logo-icon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0c0c0c" />
      </head>
      <body className="min-h-full flex flex-col bg-bg text-text-primary">{children}</body>
    </html>
  );
}
