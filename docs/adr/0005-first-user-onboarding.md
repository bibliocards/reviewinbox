# First user onboarding

ReviewInbox self-hosted installations create the first user as the owner of a default organization, then close public signup unless explicitly enabled by configuration. The hosted cloud service keeps public signup enabled and creates an organization for each new signup.

## Consequences

Self-hosted setup does not require a seed script or CLI bootstrap, but exposed deployments avoid unlimited public registrations after the first owner exists.
