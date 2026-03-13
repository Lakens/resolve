import React, { createContext, useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { fetchUser, getAuthStatus } from '../utils/api';
import { buildApiUrl } from '../utils/runtime';

export const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [oauthConfigured, setOauthConfigured] = useState(false);
  const [tokenConfigured, setTokenConfigured] = useState(false);
  const [desktopMode, setDesktopMode] = useState(false);
  const [setupPath, setSetupPath] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refreshAuth = async () => {
    try {
      setError(null);

      const authStatus = await getAuthStatus();
      setOauthConfigured(Boolean(authStatus.oauthConfigured));
      setTokenConfigured(Boolean(authStatus.tokenConfigured));
      setDesktopMode(Boolean(authStatus.desktopMode));
      setSetupPath(authStatus.setupPath || '');

      if (authStatus.authenticated) {
        const userData = await fetchUser();
        if (userData) {
          setUser(userData);
          setIsAuthenticated(true);
          return authStatus;
        }
      }

      setUser(null);
      setIsAuthenticated(false);
      return authStatus;
    } catch (err) {
      console.error('Failed to load user:', err);
      setUser(null);
      setIsAuthenticated(false);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshAuth().catch(() => {});
  }, []);

  const logout = async () => {
    try {
      await axios.post(buildApiUrl('/api/auth/logout'), {}, { withCredentials: true });
      setUser(null);
      setIsAuthenticated(false);
    } catch (err) {
      console.error('Error during logout:', err);
      setError(err.message);
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <AuthContext.Provider value={{ 
      user, 
      setUser, 
      isAuthenticated,
      oauthConfigured,
      tokenConfigured,
      desktopMode,
      setupPath,
      setIsAuthenticated,
      refreshAuth,
      logout 
    }}>
      {children}
    </AuthContext.Provider>
  );
};
