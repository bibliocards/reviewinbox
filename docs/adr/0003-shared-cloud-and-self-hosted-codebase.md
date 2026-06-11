# Shared cloud and self-hosted codebase

ReviewInbox uses one application codebase for both self-hosted deployments and the hosted cloud service, with behavior selected through deployment configuration. This avoids maintaining separate cloud and community forks while still allowing the cloud service to enable managed operations such as hosted email delivery, backups, billing, and monitoring.

## Consequences

Cloud-specific behavior should be isolated behind configuration and service boundaries rather than scattered `isCloud` checks. The self-hosted product must remain useful without billing, managed email, or hosted infrastructure dependencies.
