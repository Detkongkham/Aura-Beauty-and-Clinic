-- CreateEnum
CREATE TYPE "ConsentChannel" AS ENUM ('PUSH', 'SMS', 'EMAIL', 'LINE');

-- CreateEnum
CREATE TYPE "SuppressionReason" AS ENUM ('UNSUBSCRIBE', 'BOUNCE', 'COMPLAINT', 'MANUAL');

-- CreateTable
CREATE TABLE "marketing_consents" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "ConsentChannel" NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "grantedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "ipAddress" TEXT,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_consent_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "ConsentChannel" NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "source" TEXT NOT NULL,
    "actorId" TEXT,
    "ipAddress" TEXT,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_consent_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_suppressions" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "channel" "ConsentChannel" NOT NULL,
    "reason" "SuppressionReason" NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_suppressions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "marketing_consents_userId_channel_key" ON "marketing_consents"("userId", "channel");

-- CreateIndex
CREATE INDEX "marketing_consent_events_userId_createdAt_idx" ON "marketing_consent_events"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "marketing_suppressions_identifier_channel_key" ON "marketing_suppressions"("identifier", "channel");

-- AddForeignKey
ALTER TABLE "marketing_consents" ADD CONSTRAINT "marketing_consents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

