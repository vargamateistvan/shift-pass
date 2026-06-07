import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { Logo } from "./Logo";

export function Header() {
  const { isAuthenticated, user, signOut } = useAuth();

  return (
    <header className="header">
      <Link to="/" className="brand">
        <Logo size={26} />
        <span className="brand-name">ShiftPass</span>
      </Link>

      {isAuthenticated && (
        <nav className="nav">
          <NavLink to="/app" end>
            Inbox
          </NavLink>
          <NavLink to="/app/compose">Compose</NavLink>
          <NavLink to="/app/rotate">Rotate</NavLink>
        </nav>
      )}

      {isAuthenticated && user && (
        <div className="user">
          {user.picture && <img src={user.picture} alt="" className="avatar" />}
          <span className="user-email">{user.email}</span>
          <button className="btn btn-ghost" onClick={signOut}>
            Sign out
          </button>
        </div>
      )}
    </header>
  );
}
