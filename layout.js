import "./globals.css";

export const metadata = {
  title: "BrandProof by Innovexa",
  description: "Brand governance with receipts: review content before it goes live.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
