import { useAuth } from '../auth/useAuth';

export function SignInButton() {
  const { signIn, loading } = useAuth();
  return (
    <button className="btn btn-primary" onClick={signIn} disabled={loading}>
      {loading ? 'Connecting…' : 'Sign in with Google'}
    </button>
  );
}
