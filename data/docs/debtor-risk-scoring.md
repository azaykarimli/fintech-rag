---
id: risk-scoring
title: Debtor risk scoring — internal methodology
tenant: internal
roles: [risk]
---
# Debtor risk scoring (INTERNAL — risk team only)

Before a collection is dispatched, each debtor receives a risk score from 0 (safe) to 100
(high risk). The score is computed by the risk analytics service and combines:

- IBAN verification result (bank existence, country, checksum) — weight 30
- Historical return rate of the debtor's BIC (bank-level chargeback analysis) — weight 40
- Debtor's own history on the platform (previous AM04, MD06, MS02) — weight 30

## Thresholds
- 0–39: dispatch normally.
- 40–69: dispatch, but flag for post-settlement monitoring.
- 70–100: hold the collection and request manual approval from the risk team.

## Important
The score is advisory input to a human or rule-based decision. A score alone must never
trigger a refund, a payout hold, or a mandate cancellation without a deterministic rule
or a human approval on top of it.
