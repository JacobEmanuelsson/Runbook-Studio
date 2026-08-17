import "./globals.css";

export const metadata = {
  title: "Runbook Studio",
  description: "Incident runbook workspace for operational teams.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

