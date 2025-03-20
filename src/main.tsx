import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import StandaloneApp from "./StandaloneApp";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <StandaloneApp />
  </React.StrictMode>
);
