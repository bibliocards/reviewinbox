import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { deploymentCapabilitiesFor } from "@reviewinbox/config";

const capabilities = deploymentCapabilitiesFor("self-hosted");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <main>
      <h1>ReviewInbox</h1>
      <p>Deployment Mode: {capabilities.mode}</p>
    </main>
  </StrictMode>,
);
