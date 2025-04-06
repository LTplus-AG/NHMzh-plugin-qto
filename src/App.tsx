import { Routes, Route } from "react-router-dom";
import MainPage from "./components/MainPage";
import "./App.css";
import { ThemeProvider } from "@emotion/react";
import theme from "./theme";

// Log API URL for debugging
console.log(
  "API URL:",
  import.meta.env.VITE_API_URL || "http://localhost:8000"
);

function App() {
  return (
    <ThemeProvider theme={theme}>
      <Routes>
        <Route path="/" element={<MainPage />} />
      </Routes>
    </ThemeProvider>
  );
}

export default App;
