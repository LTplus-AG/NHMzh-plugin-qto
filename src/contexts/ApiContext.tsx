import React, { createContext, useContext, useEffect } from 'react';
import { useAuth } from '@nhmzh/shared-auth';
import { setAuthTokenGetter } from '../api/AuthenticatedApiClient';
import authenticatedApiClient from '../api/AuthenticatedApiClient';

interface ApiContextValue {
  apiClient: typeof authenticatedApiClient;
}

const ApiContext = createContext<ApiContextValue | null>(null);

export const ApiProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { getAccessToken } = useAuth();
  
  useEffect(() => {
    // Set the auth token getter for the API client
    setAuthTokenGetter(getAccessToken);
  }, [getAccessToken]);
  
  return (
    <ApiContext.Provider value={{ apiClient: authenticatedApiClient }}>
      {children}
    </ApiContext.Provider>
  );
};

export const useApi = () => {
  const context = useContext(ApiContext);
  if (!context) {
    throw new Error('useApi must be used within ApiProvider');
  }
  return context;
};
