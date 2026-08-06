import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/pt-sans-narrow/700.css";
import "./product.css";
import { ProductApp } from "./product-app.jsx";

createRoot(document.getElementById("app")).render(
  <StrictMode>
    <ProductApp />
  </StrictMode>,
);
