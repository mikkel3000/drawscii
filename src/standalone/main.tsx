import React from "react";
import { createRoot } from "react-dom/client";
// Bundled by esbuild into desktop-dist/app.css.
import "../../styles.css";
import "./desktop.css";
import { Workspace } from "./Workspace";

createRoot(document.getElementById("root")!).render(<Workspace />);
