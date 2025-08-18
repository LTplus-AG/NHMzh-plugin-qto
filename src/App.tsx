import { Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import MainPage from "./components/MainPage";
import { ApiProvider } from "./contexts/ApiContext";
import logger from './utils/logger';
import theme from './theme';
import "./App.css";

// Log the app initialization
logger.info(
  `QTO Plugin initialized. API URL: ${
    import.meta.env.VITE_QTO_API_URL || import.meta.env.VITE_API_URL || "Not configured"
  }`
);

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ApiProvider>
        <Routes>
          <Route path="/" element={<MainPage />} />
        </Routes>
      </ApiProvider>
    </ThemeProvider>
  );
}

export default App;
