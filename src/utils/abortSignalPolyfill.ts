/**
 * Polyfill for AbortSignal.timeout if not available natively
 * This ensures compatibility with browsers that don't support this method
 */
export function setupAbortSignalPolyfill(): void {
  if (!("timeout" in AbortSignal)) {
    // @ts-ignore - We're adding the method if it doesn't exist
    AbortSignal.timeout = function timeout(ms: number): AbortSignal {
      const controller = new AbortController();
      setTimeout(
        () =>
          controller.abort(new DOMException("TimeoutError", "TimeoutError")),
        ms
      );
      return controller.signal;
    };

    console.log("AbortSignal.timeout polyfill installed");
  }
}
