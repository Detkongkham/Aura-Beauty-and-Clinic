-- Data-only: bank transfers booked from an approved slip before the approval path required a
-- receiving account. Copy the account the slip was later linked to (OCR match / uploader choice)
-- onto its transaction, so those days become reconcilable. Remaining NULLs are listed on
-- /payments/banks for a manual assignment.
UPDATE "payment_transactions" AS t
SET "bankAccountId" = s."bankAccountId"
FROM "payment_slips" AS s
WHERE s."paymentTransactionId" = t."id"
  AND t."bankAccountId" IS NULL
  AND s."bankAccountId" IS NOT NULL;
