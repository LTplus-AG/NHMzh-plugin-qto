import { ThemeProvider } from "@emotion/react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import MainPage from "./components/MainPage";
import theme from "./theme";
import "./App.css";
import { setupAbortSignalPolyfill } from "./utils/abortSignalPolyfill";

// Initialize polyfill for AbortSignal.timeout
setupAbortSignalPolyfill();

// Log API URL for debugging
console.log(
  "API URL:",
  import.meta.env.VITE_API_URL || "http://localhost:8000"
);

function App() {
  return (
    <ThemeProvider theme={theme}>
      <Router>
        <div className="h-full w-full">
          <Routes>
            <Route path="/" element={<MainPage />} />
          </Routes>
        </div>
      </Router>
    </ThemeProvider>
  );
}

export default App;
