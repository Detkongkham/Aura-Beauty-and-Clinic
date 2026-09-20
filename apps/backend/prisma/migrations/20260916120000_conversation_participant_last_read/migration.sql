-- Module 38 inbox: per-participant read cursor for unread counts.
ALTER TABLE "conversation_participants" ADD COLUMN "lastReadAt" TIMESTAMP(3);

-- Backfill existing memberships as fully read so the new unread badge doesn't flood on deploy.
UPDATE "conversation_participants" SET "lastReadAt" = NOW();
