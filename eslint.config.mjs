import next from "eslint-config-next";

/** Flat config — eslint-config-next v16 ships flat config natively. */
const eslintConfig = [
  ...next,
  { ignores: [".next/**", "node_modules/**", ".data/**", "next-env.d.ts"] },
];

export default eslintConfig;
