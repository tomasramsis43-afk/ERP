-- CreateTable
CREATE TABLE "CashboxClosing" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "financialAccountId" TEXT NOT NULL,
    "closingDate" DATE NOT NULL,
    "systemBalance" DECIMAL(18,2) NOT NULL,
    "countedAmount" DECIMAL(18,2) NOT NULL,
    "difference" DECIMAL(18,2) NOT NULL,
    "reason" TEXT,
    "status" "DocStatus" NOT NULL DEFAULT 'POSTED',
    "journalEntryId" TEXT,
    "cancelReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashboxClosing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CashboxClosing_number_key" ON "CashboxClosing"("number");

-- CreateIndex
CREATE INDEX "CashboxClosing_financialAccountId_closingDate_idx" ON "CashboxClosing"("financialAccountId", "closingDate");

-- AddForeignKey
ALTER TABLE "CashboxClosing" ADD CONSTRAINT "CashboxClosing_financialAccountId_fkey" FOREIGN KEY ("financialAccountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
