// Add timeout method to AbortSignal interface
interface AbortSignal {
  /**
   * Aborts with a timeout
   * @param ms Timeout in milliseconds
   */
  static timeout(ms: number): AbortSignal;
}

// Augment environment for VITE_API_URL
interface ImportMetaEnv {
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
