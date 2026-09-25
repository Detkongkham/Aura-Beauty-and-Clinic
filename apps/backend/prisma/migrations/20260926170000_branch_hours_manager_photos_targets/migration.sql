-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "coverImageUrl" TEXT,
ADD COLUMN     "managerUserId" TEXT,
ADD COLUMN     "monthlyBookingTarget" INTEGER,
ADD COLUMN     "monthlyRevenueTarget" DECIMAL(16,2),
ADD COLUMN     "photoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "weeklyHours" JSONB;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_managerUserId_fkey" FOREIGN KEY ("managerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

