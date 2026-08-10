# Replacing an Unsuitable Accounting Vendor

> Capisoft | 2026

The initial task was to integrate Chift with Exact Online and Twinfield. I compared the vendor interface with the required workflow and found that important parts were missing.

I proposed direct provider integrations instead. The replacement used a shared accounting layer with provider-specific modules for exports, payments, documents, and legacy migration. Another engineer later added a second provider without rewriting the shared design.

This avoided an expected first-year vendor spend of about EUR 10,000. This amount is an estimate of the planned purchase, not a measured saving from an active subscription.
