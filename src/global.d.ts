export {};

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          revoke: (token: string, done: () => void) => void;
        };
      };
    };
  }
}
