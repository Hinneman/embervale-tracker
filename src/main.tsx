import { render } from "preact";

import { App } from "./app.tsx";
import { routeExternalLinks, watchSaves } from "./desktop.ts";

import "./style.css";

routeExternalLinks();
void watchSaves();
render(<App />, document.getElementById("app")!);
