import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles/professional-design-complete.css';
import "./styles/index.css";
import App from './app/App';
import { Toaster } from './app/components/ui/sonner';

// Unregister any legacy service worker AND purge its Cache Storage.
// A stale caching worker from an earlier build can otherwise keep serving an
// old app shell after a deploy. Unregistering alone leaves the cached
// responses behind, so we also delete every Cache Storage bucket.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    registrations.forEach(registration => {
      registration.unregister();
    });
  });
}
if ('caches' in window) {
  caches.keys().then(keys => {
    keys.forEach(key => caches.delete(key));
  });
}

// Temporarily disable service worker to prevent CSS loading issues
// if ('serviceWorker' in navigator) {
//   navigator.serviceWorker.register('/sw.js')
//     .then((registration) => {
//       console.log('SW registered');
//       
//       // Check for updates every 60 seconds
//       setInterval(() => {
//         registration.update();
//       }, 60000);

//       // When a new service worker is waiting,
//       // activate it immediately
//       registration.addEventListener('updatefound', () => {
//         const newWorker = registration.installing;
//         if (newWorker) {
//           newWorker.addEventListener('statechange', () => {
//             if (newWorker.state === 'installed' && 
//                 navigator.serviceWorker.controller) {
//               // New version available - force activate
//               newWorker.postMessage({ type: 'SKIP_WAITING' });
//             }
//           });
//         }
//       });
//     });

//   // Listen for reload message from service worker
//   navigator.serviceWorker.addEventListener('message', 
//     (event) => {
//       if (event.data && event.data.type === 'RELOAD_PAGE') {
//         console.log('New version deployed - reloading...');
//         window.location.reload();
//       }
//     }
//   );
// }

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    <Toaster />
  </React.StrictMode>
);