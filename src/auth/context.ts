import { createContext } from 'react';

export const GMAIL_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
].join(' ');

export interface UserProfile {
  email: string;
  name: string;
  picture: string;
}

export interface AuthContextValue {
  accessToken: string | null;
  user: UserProfile | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
  signIn: () => void;
  signOut: () => void;
  /**
   * Returns a valid access token, silently re-authenticating if the current
   * one is missing or expired.
   */
  getToken: () => Promise<string>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
);
