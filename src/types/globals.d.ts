// Hooks of the ?e2e test mode (see DEVELOPMENT.md). They are set or read only when the URL contains `e2e`.
export {};

declare global {
  interface Window {
    __e2e?: { flush: () => unknown; sync: () => unknown; repo: () => unknown };
    /** Makes the error boundary with this name throw while it renders (tests only) */
    __e2eCrash?: string;
  }
}
