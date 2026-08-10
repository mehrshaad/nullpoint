import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { Landing } from "./landing/Landing.js";

// Self-hosted rather than a CDN: the Electron build has to work offline (PLAN.md §5.3).
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./theme/tokens.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

/**
 * Two entry points from one bundle: the marketing page at "/" and the app itself at "/app".
 * The desktop shell always loads app:// at the root, so it skips the landing page entirely.
 */
const path = window.location.pathname.replace(/\/+$/, "");
const isApp = path.endsWith("/app") || Boolean(window.nullpoint);

createRoot(root).render(<StrictMode>{isApp ? <App /> : <Landing />}</StrictMode>);
