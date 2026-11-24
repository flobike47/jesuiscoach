/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BFF_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.css';

/** Identifiant du build (vite.config.ts), identique à celui de version.json. */
declare const __BUILD_ID__: string;
