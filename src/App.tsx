import { Routes, Route } from "react-router-dom";
import { Header } from "./components/Header";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Landing } from "./pages/Landing";
import { Inbox } from "./pages/Inbox";
import { Message } from "./pages/Message";
import { Compose } from "./pages/Compose";
import { Rotate } from "./pages/Rotate";

export default function App() {
  return (
    <div className="app">
      <Header />
      <main className="content">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route
            path="/app"
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
        </Routes>
      </main>
    </div>
  );
}
