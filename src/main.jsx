import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";   // <— this is required

// Register service worker early for PWA install prompt and FCM
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      // First, unregister any existing service workers to clear cache
      const existingRegistrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of existingRegistrations) {
        await registration.unregister();
        console.log('Unregistered old SW:', registration.scope);
      }
      
      // Wait a bit to ensure unregistration is complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Register without query string to avoid 404 and caching issues
      const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      console.log('SW registered: ', registration);
    } catch (err) {
      console.log('SW registration failed: ', err);
    }
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

