import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useGoogleLogin, googleLogout } from '@react-oauth/google';
import {
  AuthContext,
  GMAIL_SCOPES,
  type AuthContextValue,
  type UserProfile,
} from './context';

interface TokenState {
  token: string;
  expiresAt: number; // epoch ms
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [tokenState, setTokenState] = useState<TokenState | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resolver for the in-flight silent token request, if any.
  const pendingResolve = useRef<((token: string) => void) | null>(null);
  const pendingReject = useRef<((reason?: unknown) => void) | null>(null);

  const fetchProfile = useCallback(async (token: string) => {
    try {
      const res = await fetch(
        'https://www.googleapis.com/oauth2/v3/userinfo',
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) return;
      const data = await res.json();
      setUser({
        email: data.email,
        name: data.name ?? data.email,
        picture: data.picture ?? '',
      });
    } catch {
      /* non-fatal: profile is cosmetic */
    }
  }, []);

  const login = useGoogleLogin({
    scope: GMAIL_SCOPES,
    onSuccess: (resp) => {
      setError(null);
      setLoading(false);
      const expiresAt = Date.now() + (resp.expires_in ?? 3600) * 1000;
      setTokenState({ token: resp.access_token, expiresAt });
      void fetchProfile(resp.access_token);
      pendingResolve.current?.(resp.access_token);
      pendingResolve.current = null;
      pendingReject.current = null;
    },
    onError: (err) => {
      setLoading(false);
      const message =
        (err as { error_description?: string }).error_description ??
        'Google sign-in failed';
      setError(message);
      pendingReject.current?.(new Error(message));
      pendingResolve.current = null;
      pendingReject.current = null;
    },
  });

  const signIn = useCallback(() => {
    setLoading(true);
    setError(null);
    login();
  }, [login]);

  const signOut = useCallback(() => {
    if (tokenState) {
      try {
        window.google?.accounts.oauth2.revoke(tokenState.token, () => {});
      } catch {
        /* ignore */
      }
    }
    googleLogout();
    setTokenState(null);
    setUser(null);
  }, [tokenState]);

  const getToken = useCallback(() => {
    const valid =
      tokenState && tokenState.expiresAt - Date.now() > 60_000
        ? tokenState.token
        : null;
    if (valid) return Promise.resolve(valid);

    // Need a fresh token: trigger the token client and wait for the callback.
    return new Promise<string>((resolve, reject) => {
      pendingResolve.current = resolve;
      pendingReject.current = reject;
      setLoading(true);
      login();
    });
  }, [tokenState, login]);

  const value = useMemo<AuthContextValue>(
    () => ({
      accessToken: tokenState?.token ?? null,
      user,
      isAuthenticated: !!tokenState,
      loading,
      error,
      signIn,
      signOut,
      getToken,
    }),
    [tokenState, user, loading, error, signIn, signOut, getToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
