import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth, ProtectedRoute } from '@nhmzh/shared-auth';
import App from './App';
import { CircularProgress, Box, Typography } from '@mui/material';

const LoadingScreen = () => (
  <Box
    display="flex"
    flexDirection="column"
    alignItems="center"
    justifyContent="center"
    minHeight="100vh"
  >
    <CircularProgress />
    <Typography variant="h6" sx={{ mt: 2 }}>
      Authenticating...
    </Typography>
  </Box>
);

const UnauthorizedScreen = () => (
  <Box
    display="flex"
    flexDirection="column"
    alignItems="center"
    justifyContent="center"
    minHeight="100vh"
  >
    <Typography variant="h4" color="error">
      Access Denied
    </Typography>
    <Typography variant="body1" sx={{ mt: 2 }}>
      You don't have permission to access this application.
    </Typography>
  </Box>
);

const AuthenticatedContent = () => {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated || !user) {
    return <LoadingScreen />;
  }

  return (
    <Routes>
      <Route
        path="/plugin-qto/*"
        element={
          <ProtectedRoute
            requiredRoles={['Admin', 'Projektleitung_Architektur', 'Projektleitung_Statik', 
                           'Projektleitung_Gebaudetechnik', 'Fachplanung_Kosten', 
                           'Fachplanung_Oekobilanz', 'Fachplanung_Gebaudetechnik', 'Viewer']}
            fallbackPath="/unauthorized"
          >
            <App />
          </ProtectedRoute>
        }
      />
      <Route path="/unauthorized" element={<UnauthorizedScreen />} />
      <Route path="/" element={<Navigate to="/plugin-qto" replace />} />
    </Routes>
  );
};

const AuthenticatedApp = () => {
  return (
    <BrowserRouter>
      <AuthProvider appName="plugin-qto" autoLogin={true}>
        <AuthenticatedContent />
      </AuthProvider>
    </BrowserRouter>
  );
};

export default AuthenticatedApp;
