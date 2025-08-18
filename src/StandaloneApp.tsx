import AuthenticatedApp from "./AuthenticatedApp";

// This component now wraps the app with authentication
function StandaloneApp() {
  return <AuthenticatedApp />;
}

export default StandaloneApp;
