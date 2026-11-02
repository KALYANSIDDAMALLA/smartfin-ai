import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // GitHub Codespaces opens the dev server at https://<name>-3000.app.github.dev; the dev server blocks that origin unless it is allowed. Only added inside a codespace.
  ...(process.env.CODESPACES ? { allowedDevOrigins: ["*.app.github.dev"] } : {}),
  compress: true,
  // staleTimes: pages you just visited (or hovered a link to) are reused for a short time, so clicking back and forth is instant. Saving anything clears it.
  experimental: { optimizePackageImports: ["lucide-react", "recharts", "date-fns"], staleTimes: { dynamic: 30, static: 60 } },
  reactCompiler: true,
  serverExternalPackages: ["pdfkit", "pdf-parse"],
  async redirects() { return [{ source: "/recurring", destination: "/repayments", permanent: true }]; }, // renamed: old bookmarks and links keep working
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};
export default nextConfig;
