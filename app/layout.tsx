import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["300", "400", "500", "600"],
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Club 19 London | Sales Atelier",
  description:
    "Elegant invoice creation and sales management for Club 19 London",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: "#000000",
          colorBackground: "#ffffff",
          colorText: "#000000",
        },
        elements: {
          formButtonPrimary:
            "bg-club19-black hover:bg-club19-charcoal text-white uppercase tracking-wide",
          card: "border border-club19-platinum",
        },
      }}
    >
      <html lang="en" className={`${inter.variable} ${playfair.variable}`}>
        <body className={inter.className}>
          <ErrorBoundary>
            <div className="min-h-screen bg-white">{children}</div>
          </ErrorBoundary>
        </body>
      </html>
    </ClerkProvider>
  );
}
