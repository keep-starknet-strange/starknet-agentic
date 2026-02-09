import type { NextConfig } from "next";
<<<<<<< HEAD

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
=======
import createMDX from "@next/mdx";

const nextConfig: NextConfig = {
  output: "standalone",
  pageExtensions: ["ts", "tsx", "md", "mdx"],
};

const withMDX = createMDX({});

export default withMDX(nextConfig);
>>>>>>> origin/main
