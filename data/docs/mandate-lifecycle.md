---
id: mandate-lifecycle
title: SEPA mandate lifecycle
tenant: public
roles: [support, ops, risk, merchant]
---
# SEPA mandate lifecycle

A mandate authorises a creditor to collect from a debtor's account. States:

1. **Draft** — created but not yet signed.
2. **Active** — signed; collections allowed. The first collection must be sent at least
   5 business days before the due date (FRST), subsequent ones 2 business days (RCUR).
   Since the 2016 scheme change, FRST/RCUR sequencing is no longer mandatory, but many
   banks still validate it.
3. **Suspended** — temporarily paused, e.g. after an MD01 or a debtor request.
4. **Terminated** — permanently closed, e.g. after AC04, or after 36 months without any
   collection (mandate expiry rule).

Idempotency: every collection carries a unique end-to-end ID. Re-submitting a collection
with the same end-to-end ID must not produce a second debit.
