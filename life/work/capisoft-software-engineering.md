# Production Software at Capisoft

> Software Engineer | March 2026 - present

## Role

I work on LegalPal, an all-in-one software platform for law firms. My main responsibility covers accounting integrations and outbound email.

The role moved my work from customer architecture into daily ownership of production software.

## Main systems

Two projects represent the work most clearly:

- [A direct accounting integration layer](accounting-integrations.md)
- [A durable outbound email system](durable-email-outbox.md)

Both systems cross an unreliable external boundary. They need persistent state, safe retries, clear failure behavior, and operational recovery.

## Engineering range

The work spans Django, React, PostgreSQL, Celery, Microsoft Graph, Kubernetes, AWS, tests, and deployment tools.

The technology list is less important than the recurring pattern. I frame the real requirement, inspect the failure modes, and use evidence to guide delivery.

## Current lesson

Production work rewards depth. A feature is not complete when the code exists.

It also needs safe rollout behavior, useful monitoring, and a recovery path when an external system behaves differently than expected.
