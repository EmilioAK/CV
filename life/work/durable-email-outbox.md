# Building a Durable Email Outbox

> Capisoft | 2026

## The reliability problem

An email send crosses a boundary between the application and an external provider. A timeout can hide whether the provider accepted the message.

A blind retry can then create a duplicate. Missing persistence can also lose the message or its recovery state.

## Architecture

I identified the need for a durable outbox and directed the implementation.

The system stores a delivery record before it attempts the external send. It uses duplicate protection, explicit states, safe retries, and crash recovery.

It also treats uncertain outcomes as a separate state. The system does not retry blindly when the first send can already have succeeded.

## Delivery

The work expanded from one path to a company-wide email flow. I owned the rollout and production monitoring.

Staging exposed failures that the first design did not cover. Those findings produced follow-up fixes before broader use.

## What this changed

The project made reliability concrete. A happy-path API call is only one part of an external integration.

The harder work concerns persistence, idempotency, recovery, and honest behavior after an uncertain result.
