/** AniChart content entrypoint for browse surfaces. */

import "@/shared/styles/content-base.css";
import { main as anichartBrowseMain } from "@/content/anichart/browse";

export default defineContentScript({
	matches: ["https://anichart.net/*", "https://www.anichart.net/*"],
	cssInjectionMode: "ui",
	runAt: "document_end",
	main: anichartBrowseMain,
});
