-- AlterTable
ALTER TABLE "users" ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "lastLoginDevice" TEXT,
ADD COLUMN     "quickLoginUpdatedAt" TIMESTAMP(3);
