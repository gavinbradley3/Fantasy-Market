// Types for the plain-JS Tailwind config so the token parity test can read it.
declare const config: {
  content: string[];
  theme: {
    extend: {
      colors: Record<string, unknown>;
      fontFamily: Record<string, string[]>;
      fontSize: Record<string, unknown>;
      borderRadius: Record<string, string>;
      boxShadow: Record<string, string>;
      [key: string]: unknown;
    };
  };
  plugins: unknown[];
};

export default config;
