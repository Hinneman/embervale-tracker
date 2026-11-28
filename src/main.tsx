import { render } from "preact";

import { App } from "./app.tsx";
import { routeExternalLinks, watchSaves } from "./desktop.ts";

import "@fontsource/alegreya-sans/400.css";
import "@fontsource/alegreya-sans/500.css";
import "@fontsource/alegreya-sans/700.css";
import "@fontsource-variable/cinzel";
import "./style.css";

routeExternalLinks();
void watchSaves();
render(<App />, document.getElementById("app")!);
