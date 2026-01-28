import * as tailwind from "prettier-plugin-tailwindcss";

/** @type {import("prettier").Config} */
const config = {
  trailingComma: "es5",
  tabWidth: 2,
  semi: false,
  singleQuote: true,
  plugins: [tailwind],
  tailwindConfig: "./tailwind.config.js",
};

export default config;
