import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",
  workboxOptions: {
    disableDevLogs: true,
  },
});

import ESLintPlugin from "eslint-webpack-plugin";

const nextConfig: NextConfig = {
  webpack: (config, { dev }) => {
    if (dev) {
      config.plugins.push(
        new ESLintPlugin({
          extensions: ["js", "jsx", "ts", "tsx"],
          exclude: ["node_modules", ".next", "out"],
        })
      );
    }
    return config;
  },
};

export default withPWA(nextConfig);
