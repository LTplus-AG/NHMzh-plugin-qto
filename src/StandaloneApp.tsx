import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import App from "./App";

function StandaloneApp() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/plugin-qto" replace />} />
        <Route path="/plugin-qto/*" element={<App />} />
      </Routes>
    </BrowserRouter>
  );
}

export default StandaloneApp;
