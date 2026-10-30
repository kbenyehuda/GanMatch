/** @type {import('next').NextConfig} */
const nextConfig = {
  // A local `NEXT_DIST_DIR=.next-build npm run build` (pre-deploy check) must not overwrite the
  // running dev server's `.next`, which breaks its styles. Unset on Vercel → default ".next".
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
