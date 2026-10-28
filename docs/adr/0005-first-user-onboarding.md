# First user onboarding

> Status: partially superseded. After the first self-hosted user, signup requires a valid invitation. Organization setup differs between Cloud and self-hosted flows; see [current auth and ownership](../architecture.md#organization-ownership).

ReviewInbox self-hosted installations create the first user as the owner of a default organization, then close public signup unless explicitly enabled by configuration. The hosted cloud service keeps public signup enabled and creates an organization for each new signup.

## Consequences

Self-hosted setup does not require a seed script or CLI bootstrap, but exposed deployments avoid unlimited public registrations after the first owner exists.
