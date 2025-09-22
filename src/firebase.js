import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBOIBP01j6m1K7DrwsQCo9bWN1yG-e48RM",
  authDomain: "kartavya-58d2c.firebaseapp.com",
  projectId: "kartavya-58d2c",
  storageBucket: "kartavya-58d2c.firebasestorage.app",
  messagingSenderId: "899861294582",
  appId: "1:899861294582:web:80adaebe5a29daacac2bd7",
  measurementId: "G-TW66R38EE6"
};

const app = initializeApp(firebaseConfig);

// Firestore with optimized transport and local cache
export const db = initializeFirestore(app, {
  // Force long-polling transport to avoid WebChannel being blocked by extensions/network
  experimentalForceLongPolling: true,
  // Prefer XHR over fetch streams in restrictive environments
  useFetchStreams: false,
  localCache: persistentLocalCache()
});

// Auth
export const auth = getAuth(app);

// Messaging helpers (guarded for unsupported environments)
export const messagingPromise = isSupported().then((supported) => (supported ? getMessaging(app) : null));

export async function enablePushNotifications(vapidKey) {
  if (!("Notification" in window)) {
    throw new Error("Notifications not supported");
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Permission denied");
  }
  const messaging = await messagingPromise;
  if (!messaging) {
    throw new Error("Messaging not supported");
  }
  // Reuse existing SW if available; otherwise register without query string
  let swReg = (await navigator.serviceWorker.getRegistration('/')) || (await navigator.serviceWorker.getRegistration());
  if (!swReg) {
    swReg = await navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/" });
  }
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: swReg });
  return token;
}

export function onForegroundMessage(callback) {
  messagingPromise.then((m) => {
    if (!m) return;
    onMessage(m, (payload) => callback?.(payload));
  });
}