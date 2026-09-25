import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { installChunkRecoveryListeners } from "@/lib/chunk-recovery";

installChunkRecoveryListeners();
createRoot(document.getElementById("root")!).render(<App />);
