import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { deploymentCapabilitiesFor, parseDeploymentMode } from "@reviewinbox/config";
import { createDatabase, schema } from "@reviewinbox/db";
import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";

const db = createDatabase();
const capabilities = deploymentCapabilitiesFor(
  parseDeploymentMode(process.env.REVIEWINBOX_DEPLOYMENT_MODE),
);
const authEnvironment = readAuthEnvironment(process.env);

export const firstUserOnboarding = {
  createsDefaultOrganization: capabilities.firstUserCreatesDefaultOrganization,
  publicSignupInitiallyAllowed: capabilities.publicSignup,
} as const;

export const auth = betterAuth({
  baseURL: authEnvironment.baseUrl,
  secret: authEnvironment.secret,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
  },
  plugins: [organization()],
});

function readAuthEnvironment(env: NodeJS.ProcessEnv): { baseUrl: string; secret: string } {
  const baseUrl = env.BETTER_AUTH_URL;
  const secret = env.BETTER_AUTH_SECRET;
  const production = env.NODE_ENV === "production";

  if (!baseUrl) {
    throw new Error("BETTER_AUTH_URL must be configured.");
  }

  if (production && !baseUrl.startsWith("https://")) {
    throw new Error("BETTER_AUTH_URL must use HTTPS in production.");
  }

  if (!secret || secret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must be at least 32 characters.");
  }

  return { baseUrl, secret };
}
