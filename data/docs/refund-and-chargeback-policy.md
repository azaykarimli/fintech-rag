---
id: refund-policy
title: Refund and chargeback policy for merchants
tenant: public
roles: [support, ops, risk, merchant]
---
# Refund and chargeback policy

## Debtor refund right
Under the SEPA Core Direct Debit scheme, a debtor can request a refund of any authorised
collection within 8 weeks of the debit date, with no reason required. For unauthorised
collections (no valid mandate) the period is 13 months.

## Who bears the cost
Refunds (MD06) are debited from the merchant's settlement balance. The platform charges a
fixed chargeback fee of EUR 3.50 per MD06 on top of the refunded amount.

## Risk review threshold
A merchant whose MD06 ratio exceeds 0.5% of collections over a rolling 90-day window is
placed under risk review. During review, payout delay is extended from T+2 to T+7.

## Merchant-initiated refunds
Merchants can refund a collection from the dashboard at any time before the 8-week
window closes. Merchant-initiated refunds do not count towards the MD06 ratio.
