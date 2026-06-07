import { Link, Route, Routes } from "react-router-dom";
import { Header } from "./components/Header";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Landing } from "./pages/Landing";
import { Inbox } from "./pages/Inbox";
import { Message } from "./pages/Message";
import { Compose } from "./pages/Compose";
import { Rotate } from "./pages/Rotate";
import { Passwords } from "./pages/Passwords";
import { Privacy } from "./pages/Privacy";
import { Terms } from "./pages/Terms";
import { LoadedCsvProvider } from "./passwords/LoadedCsvContext";

export default function App() {
  return (
    <LoadedCsvProvider>
      <div className="app">
        <Header />
        <main className="content">
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route
              path="/app"
              element={
                <ProtectedRoute>
                  <Passwords />
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/inbox"
              element={
                <ProtectedRoute>
                  <Inbox />
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/message/:id"
              element={
                <ProtectedRoute>
                  <Message />
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/compose"
              element={
                <ProtectedRoute>
                  <Compose />
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/rotate"
              element={
                <ProtectedRoute>
                  <Rotate />
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/passwords"
              element={
                <ProtectedRoute>
                  <Passwords />
                </ProtectedRoute>
              }
            />
          </Routes>
        </main>
        <footer className="site-footer">
          <Link to="/privacy">Privacy Policy</Link>
          <span aria-hidden="true">•</span>
          <Link to="/terms">Terms of Service</Link>
        </footer>
      </div>
    </LoadedCsvProvider>
  );
}
