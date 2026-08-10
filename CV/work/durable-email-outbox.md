# Building a Durable Email Outbox

> Capisoft | 2026

An email timeout can hide whether the provider accepted a message. A blind retry can create a duplicate, while missing state can lose the recovery path.

I identified the need for a durable outbox and directed the implementation. The system stores a delivery record before sending. It uses duplicate protection, explicit states, safe retries, crash recovery, and a separate state for uncertain outcomes.

The work expanded into a company-wide email flow. I owned its rollout and production monitoring. Staging exposed missing failure cases, which we fixed before broader use.
