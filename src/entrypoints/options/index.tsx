/** Immediate options-page mount with shared styles loaded first. */
// src/entrypoints/options/index.tsx

import "./style.css";
import { mountOptionsApp } from "./options-app";

const rootElement = document.querySelector("#options-root");

if (rootElement) {
	mountOptionsApp(rootElement);
}
