import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import "./index.css";
import App from "./App.tsx";
import { AuthProvider } from "./auth/AuthContext";

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

const tree = clientId ? (
  <GoogleOAuthProvider clientId={clientId}>
    <AuthProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <App />
      </BrowserRouter>
    </AuthProvider>
  </GoogleOAuthProvider>
) : (
  <div className="config-error">
    <h1>Missing configuration</h1>
    <p>
      Set <code>VITE_GOOGLE_CLIENT_ID</code> in a <code>.env</code> file (see{" "}
      <code>.env.example</code>) and restart the dev server.
    </p>
  </div>
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>{tree}</StrictMode>,
);
