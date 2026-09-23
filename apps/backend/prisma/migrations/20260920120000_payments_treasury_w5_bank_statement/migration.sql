-- CreateTable
CREATE TABLE "bank_statement_entries" (
    "id" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "statementDate" DATE NOT NULL,
    "statementCredit" DECIMAL(16,2) NOT NULL,
    "statementDebit" DECIMAL(16,2) NOT NULL,
    "note" TEXT,
    "enteredById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_statement_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bank_statement_entries_bankAccountId_statementDate_key" ON "bank_statement_entries"("bankAccountId", "statementDate");

-- AddForeignKey
ALTER TABLE "bank_statement_entries" ADD CONSTRAINT "bank_statement_entries_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
