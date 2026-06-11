import { deploymentCapabilitiesFor } from "@reviewinbox/config";

const capabilities = deploymentCapabilitiesFor("self-hosted");

console.log(`ReviewInbox worker ready for ${capabilities.mode} deployment mode.`);
