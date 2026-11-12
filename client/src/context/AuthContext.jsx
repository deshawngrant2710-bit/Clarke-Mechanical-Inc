import { createContext, useContext, useEffect, useState } from 'react';
import api from '../api/client';
import { clearCache } from '../lib/queryCache';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
  });

  // On launch, if we have a session, swap the token for a fresh one so the
  // long-lived session keeps sliding and effectively never expires. Silent —
  // a failure here just leaves the existing token in place.
  useEffect(() => {
    if (!localStorage.getItem('token')) return;
    api.post('/auth/refresh').then(({ data }) => {
      if (data?.token) localStorage.setItem('token', data.token);
      if (data?.user) { localStorage.setItem('user', JSON.stringify(data.user)); setUser(data.user); }
    }).catch(() => {});
  }, []);

  function login(token, userData) {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    clearCache();
    setUser(null);
  }

  // Merge changes into the current user and persist (e.g. after editing the account panel).
  function updateUser(patch) {
    setUser(prev => {
      const next = { ...prev, ...patch };
      localStorage.setItem('user', JSON.stringify(next));
      return next;
    });
  }

  return <AuthContext.Provider value={{ user, login, logout, updateUser }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
