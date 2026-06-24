// Global type declarations

declare namespace NodeJS {
  interface ProcessEnv {
    APP_VERSION: string;
  }
}

declare module '*.css';

declare module '*.svg' {
  const url: string;
  export default url;
}
