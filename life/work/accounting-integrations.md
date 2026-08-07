# Replacing an Unsuitable Accounting Vendor

> Capisoft | 2026

## Original direction

The initial task was to integrate Chift with Exact Online and Twinfield. The actual requirement was a reliable accounting workflow.

I compared the vendor capabilities with the required flow. Important parts of the requirement were not available through the examined interface.

## Decision

I challenged the assigned direction and proposed direct provider integrations.

The replacement used a shared accounting layer with provider-specific modules. It covered export records, payment synchronization, document synchronization, and legacy migration.

Another engineer later added a second accounting system without rewriting the shared design.

## Result

Capisoft received the required workflows without the planned vendor purchase. The avoided expected first-year spend was approximately EUR 10,000.

The amount is an estimate of the planned purchase. It is not a measured saving from a canceled active subscription.

## What this changed

This project strengthened a central lesson: the assigned solution is not always the real requirement.

Good engineering starts by making sure that the proposed tool fits the business need.
