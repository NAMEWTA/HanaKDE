import React, { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { HanaThemeProvider } from "@hana/plugin-components";
import { mountTodoApp } from "./browser-app.ts";

function TodoPage(): React.ReactElement {
  const hostRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => hostRef.current ? mountTodoApp(hostRef.current) : undefined, []);
  return <HanaThemeProvider mode="inherit"><div ref={hostRef} className="react-todo-host" /></HanaThemeProvider>;
}

const root = document.getElementById("root");
if (!root) throw new Error("Todo root element is missing");
createRoot(root).render(<TodoPage />);
