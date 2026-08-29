import React, { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { HanaThemeProvider } from "@hana/plugin-components";
import { hana } from "@hana/plugin-sdk";
import { mountTodoApp } from "./browser-app.ts";

function TodoPage(): React.ReactElement {
  const hostRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => hostRef.current ? mountTodoApp(hostRef.current, hana) : undefined, []);
  return <HanaThemeProvider mode="inherit"><div ref={hostRef} className="react-todo-host todo-theme" /></HanaThemeProvider>;
}

const root = document.getElementById("root");
if (!root) throw new Error("Todo root element is missing");
createRoot(root).render(<TodoPage />);
