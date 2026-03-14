import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const LogOutIcon = ({ size = 16, className = '' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
);
const SettingsIcon = ({ size = 20, className = '' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" /></svg>
);

export default function Header({ currentUser, onLogout, onToggleAdminPanel, language, setLanguage, t, tasks, users, departments, onEnablePush, isDesktopMode, onToggleDesktopMode }) {
  const [isMenuOpen, setMenuOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [canInstall, setCanInstall] = useState(false);
  const navigate = useNavigate();

  // Capture the PWA install prompt
  React.useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setCanInstall(true);
    };
    const onInstalled = () => {
      setCanInstall(false);
      setDeferredPrompt(null);
    };
    
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches || 
        window.navigator.standalone === true) {
      setCanInstall(false);
    }
    
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleInstallPWA = async () => {
    try {
      if (deferredPrompt) {
        // Show the install prompt
        setMenuOpen(false);
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        setDeferredPrompt(null); // can only be used once
        if (outcome === 'accepted') setCanInstall(false);
      } else {
        // Fallback: check if app can be installed
        if (window.matchMedia('(display-mode: standalone)').matches) {
          alert('App is already installed!');
        } else if (canInstall) {
          alert('Install prompt not available. Please use your browser\'s install option.');
        } else {
          alert('This app cannot be installed on your device/browser.');
        }
      }
    } catch (error) {
      console.error('Install error:', error);
      alert('Installation failed. Please try again.');
    }
  };
  
  const handleLanguageToggle = () => { setLanguage(language === 'en' ? 'hi' : 'en'); setMenuOpen(false); };
  const handleAdminPanelToggle = () => { onToggleAdminPanel(); setMenuOpen(false); };
  const handleGoHome = () => {
    setMenuOpen(false);
    navigate('/');
  };

  return (
    <>
      <header className="flex items-center justify-between p-3 bg-slate-900 text-white shadow-md">
        <button
          type="button"
          onClick={handleGoHome}
          className="flex items-center gap-3 rounded-md focus:outline-none focus:ring-2 focus:ring-white/60"
        >
          <img 
            src="/favicon.ico" 
            alt="Karya" 
            className="h-6 w-6 object-contain" 
          />
          <h1 className="font-bold text-lg">Karya</h1>
        </button>
        <div className="flex items-center gap-3">
          {currentUser && (
            <div className="relative">
              
              <button onClick={() => setMenuOpen((p) => !p)} className="btn-ghost">
                <SettingsIcon />
              </button>
              {isMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-black rounded-md shadow-lg py-1 z-20 text-white">
                  <button onClick={handleLanguageToggle} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-700">
                    {language === 'en' ? 'हिंदी में देखें' : 'View in English'}
                  </button>
                  {typeof onToggleDesktopMode === 'function' && (
                    <button
                      onClick={() => { onToggleDesktopMode(); setMenuOpen(false); }}
                      className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-700 flex items-center justify-between"
                      title={isDesktopMode ? 'Switch to mobile layout' : 'Enable power-user desktop layout'}
                    >
                      <span>{isDesktopMode ? '🖥️ Desktop mode: On' : '📱 Desktop mode: Off'}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${isDesktopMode ? 'bg-green-600/80' : 'bg-gray-600'}`}>
                        {isDesktopMode ? 'ON' : 'OFF'}
                      </span>
                    </button>
                  )}
                  {/* Install option removed per request; PWA functionality remains active */}
                  <button 
                    onClick={async () => {
                      if (window.confirm('Are you sure you want to reset the app? This will clear local caches and fetch the latest version but will keep you logged in.')) {
                        try {
                          // Unregister service workers
                          if ('serviceWorker' in navigator) {
                            const registrations = await navigator.serviceWorker.getRegistrations();
                            for (let registration of registrations) {
                              await registration.unregister();
                            }
                          }
                          // Clear PWA caches (CSS/JS/HTML file cache only)
                          if ('caches' in window) {
                            const keys = await caches.keys();
                            await Promise.all(keys.map(key => caches.delete(key)));
                          }
                          // Only clear app-specific localStorage, never auth keys
                          const appKeys = [];
                          for (let i = 0; i < localStorage.length; i++) {
                            const key = localStorage.key(i);
                            if (key && key.startsWith('kartavya_')) {
                              appKeys.push(key);
                            }
                          }
                          appKeys.forEach(key => localStorage.removeItem(key));
                          // Finally, hard reload
                          window.location.reload(true);
                        } catch (e) {
                          console.error('Error during hard reset:', e);
                          window.location.reload(true);
                        }
                      }
                    }} 
                    className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-700 text-yellow-400"
                  >
                    🔄 Hard Reset App
                  </button>
                  {currentUser.role === 'Admin' && (
                    <button onClick={handleAdminPanelToggle} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-700">
                      {t('adminPanel')}
                    </button>
                  )}
                  <div className="border-t border-gray-700 my-1"></div>
                  <button onClick={() => { onLogout(); setMenuOpen(false); }} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-700 flex items-center gap-2">
                    <LogOutIcon size={16} /> {t('logout')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>


    </>
  );
}



