---
id: sepa-return-codes
title: SEPA Direct Debit return codes (R-transactions)
tenant: public
roles: [support, ops, risk]
---
# SEPA Direct Debit return codes

When a SEPA Direct Debit (SDD) collection fails, the debtor bank returns an R-transaction
with an ISO 20022 reason code. The most frequent codes and how we handle them:

## AC01 — Incorrect account number
The IBAN is syntactically valid but does not exist or is closed. Treatment: block the
mandate, do not retry automatically, ask the merchant to collect a new IBAN from the debtor.

## AC04 — Closed account
The account has been closed by the debtor. Treatment: mark the mandate as terminated;
retries are pointless and generate bank fees.

## AC06 — Blocked account
The account is blocked for direct debits. Treatment: same as AC04, but the merchant may
contact the debtor since the block can be lifted.

## AM04 — Insufficient funds
The debtor had no funds on the collection date. Treatment: this is the only code we retry
automatically. Policy: at most 2 retries, spaced 5 business days apart, then escalate to
the merchant for manual collection.

## MD01 — No mandate
The bank has no valid mandate. Treatment: the mandate must be re-signed; collections are
suspended immediately.

## MD06 — Refund request by the debtor (disputed)
The debtor exercised the 8-week no-questions-asked refund right. Treatment: the refund is
charged back to the merchant; a second MD06 on the same mandate triggers a risk review.

## MS02 — Refusal by the debtor
The debtor refused the collection before settlement. Treatment: no retry; contact debtor.

## SL01 — Specific service offered by the debtor bank
Typically a debtor-side blacklist/whitelist. Treatment: no retry; the debtor must
whitelist the creditor identifier at their bank.

## Retry policy summary
Only AM04 is retried automatically (max 2 retries, 5 business days apart). All other codes
stop automatic collection and require a mandate or account change.
