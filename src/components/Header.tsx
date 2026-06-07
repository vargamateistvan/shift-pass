import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';

export function Header() {
  const { isAuthenticated, user, signOut } = useAuth();

  return (
    <header className="header">
      <Link to="/" className="brand">
        📬 Gmail Manager
      </Link>

      {isAuthenticated && (
        <nav className="nav">
          <NavLink to="/app" end>
            Inbox
          </NavLink>
          <NavLink to="/app/compose">Compose</NavLink>
        </nav>
      )}

      {isAuthenticated && user && (
        <div className="user">
          {user.picture && (
            <img src={user.picture} alt="" className="avatar" />
          )}
          <span className="user-email">{user.email}</span>
          <button className="btn btn-ghost" onClick={signOut}>
            Sign out
          </button>
        </div>
      )}
    </header>
  );
}
