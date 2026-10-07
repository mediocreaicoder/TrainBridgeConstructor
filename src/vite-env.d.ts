/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the high-score worker, without a trailing slash. Unset: no high scores. */
  readonly VITE_API_URL?: string;
}
