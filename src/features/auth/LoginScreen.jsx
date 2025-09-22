import React, { useState, useEffect } from 'react';
import { getLogoPath } from '../../config/domains.js';

export default function LoginScreen({ users, onLogin, isLoading, t }) {
  const [selectedId, setSelectedId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [touched, setTouched] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [logoError, setLogoError] = useState(false);

  // Debug logging
  console.log('LoginScreen: users prop:', users?.length, users);
  console.log('LoginScreen: isLoading:', isLoading);

  // Set default selected user when users load
  useEffect(() => {
    if (users.length > 0 && !selectedId) {
      setSelectedId(users[0].id);
    }
  }, [users, selectedId]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setIsLoggingIn(true);
    
    try {
      const user = users.find((u) => u.id === selectedId);
      if (!user) { 
        setError('User not found'); 
        return; 
      }
      
      if (user.password === password) {
        onLogin(user.id);
      } else {
        setError(t('invalidLogin') || 'Invalid password');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(t('invalidLogin') || 'Login failed. Please try again.');
    } finally {
      setIsLoggingIn(false);
    }
  }

  return (
    <div className="card mt-8">
      <div className="flex flex-col items-center mb-4">
        {!logoError ? (
          <img 
            loading="lazy" 
            src={getLogoPath()} 
            alt="Urjatech" 
            className="h-8 w-auto max-w-full object-contain" 
            style={{ maxHeight: '2rem' }} 
            onError={() => setLogoError(true)}
          />
        ) : (
          <div className="h-8 flex items-center justify-center bg-blue-600 text-white px-3 py-1 rounded font-bold text-sm">
            URJATECH
          </div>
        )}
        <h2 className="text-xl font-bold">{t('welcome')}</h2>
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-3">
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="select"
          disabled={isLoading || users.length === 0}
        >
          {isLoading && <option>{t('loading')}</option>}
          {!isLoading && users.length === 0 && <option>No users found</option>}
          {!isLoading && users.length > 0 && users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name || u.username || u.email}
            </option>
          ))}
        </select>
        
        <input 
          type="password" 
          className={`input ${touched && !password ? 'border-red-500 ring-red-300 ring-2' : ''}`} 
          placeholder={t('password')} 
          value={password} 
          onChange={(e) => setPassword(e.target.value)} 
          onBlur={() => setTouched(true)} 
          disabled={isLoading || isLoggingIn} 
          required
        />
        
        {error && (
          <div className="text-red-500 text-sm text-center">{error}</div>
        )}
        
        <button 
          type="submit" 
          className="w-full btn btn-primary disabled:!bg-slate-400" 
          disabled={isLoading || isLoggingIn || !selectedId || !password}
        >
          {isLoggingIn ? 'Signing in...' : (isLoading ? t('loading') : t('login'))}
        </button>
      </form>
      
      {/* Debug info - remove in production */}
      {process.env.NODE_ENV === 'development' && (
        <div className="mt-4 p-3 bg-slate-100 rounded text-xs text-slate-600">
          <div>Debug: {users.length} users loaded</div>
          <div>Users: {users.map(u => u.username || u.name || u.email).join(', ')}</div>
        </div>
      )}
    </div>
  );
}



