import React, { useState } from 'react';

const LogOutIcon = ({ size = 16, className = '' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
);
const SettingsIcon = ({ size = 20, className = '' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" /></svg>
);

export default function Header({ currentUser, onLogout, onToggleAdminPanel, language, setLanguage, t, tasks, users, departments, onEnablePush, onToggleAttendance }) {
  const [isMenuOpen, setMenuOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [canInstall, setCanInstall] = useState(false);

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
  const handleAttendanceToggle = () => { onToggleAttendance(); setMenuOpen(false); };

  return (
    <>
      <header className="flex items-center justify-between p-3 bg-slate-900 text-white shadow-md">
        <div className="flex items-center gap-3">
          <img 
            src="/favicon.ico" 
            alt="Karya" 
            className="h-6 w-6 object-contain" 
          />
          <h1 className="font-bold text-lg">Karya</h1>
        </div>
        <div className="flex items-center gap-3">
          {currentUser && (
            <div className="relative">
              
              <button onClick={() => setMenuOpen((p) => !p)} className="btn-ghost">
                <SettingsIcon />
              </button>
              {isMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-black rounded-md shadow-lg py-1 z-20 text-white">
                  <button onClick={handleAttendanceToggle} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-700">
                    📅 {t('attendance')}
                  </button>
                  <button onClick={handleLanguageToggle} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-700">
                    {language === 'en' ? 'हिंदी में देखें' : 'View in English'}
                  </button>
                  {/* Install option removed per request; PWA functionality remains active */}
                  <button onClick={() => window.location.reload()} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-700">
                    🔄 Reload App
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



