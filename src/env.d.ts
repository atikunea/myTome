/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * OAuth client id for Google Drive sync (a "Web application" client). Public
   * by design — this flow has no client secret, and there must never be one in
   * the bundle. Absent or blank leaves the Drive UI as a description of what it
   * would do, with nothing to click: see `services/drive.ts`.
   */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
