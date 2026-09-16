---
id: creditor-identifier
title: SEPA Creditor Identifier (CID) requirements
tenant: public
roles: [support, ops, risk, merchant]
---
# SEPA Creditor Identifier (CID)

A Creditor Identifier (CID) is issued by the national authority in the creditor's country
and is required before any mandate can be created on that creditor's behalf.

## Format
`CC NN ZZZ XXXXXXXXXXX` — 2-letter country code, 2 check digits, 3-character business
code (or `ZZZ` if unused), then up to 28 alphanumeric characters assigned by the issuer.

## Validation
The platform validates the CID's check digits using the same MOD-97 algorithm as IBAN
before allowing a mandate to be created. A CID that fails validation blocks onboarding;
support cannot override this manually.

## Rotation
If a creditor's CID is revoked or reissued, every active mandate under the old CID must
be re-signed within 90 days or it is automatically suspended.
