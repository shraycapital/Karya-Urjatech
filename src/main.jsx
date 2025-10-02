import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";   // <— this is required

// Register service worker for PWA + FCM without breaking offline caches
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      // Simple registration without complex logic to avoid conflicts
      const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/" });
      console.log("SW registered:", registration);
    } catch (err) {
      console.log("SW registration failed:", err);
    }
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

