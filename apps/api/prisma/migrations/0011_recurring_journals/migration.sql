-- CreateTable
CREATE TABLE "RecurringJournal" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "dayOfMonth" INTEGER,
    "dayOfWeek" INTEGER,
    "nextRunDate" DATE NOT NULL,
    "lastRunDate" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecurringJournal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringJournalLine" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "debit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "description" TEXT,

    CONSTRAINT "RecurringJournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecurringJournal_code_key" ON "RecurringJournal"("code");

-- CreateIndex
CREATE INDEX "RecurringJournal_isActive_nextRunDate_idx" ON "RecurringJournal"("isActive", "nextRunDate");

-- CreateIndex
CREATE INDEX "RecurringJournalLine_templateId_idx" ON "RecurringJournalLine"("templateId");

-- AddForeignKey
ALTER TABLE "RecurringJournalLine" ADD CONSTRAINT "RecurringJournalLine_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "RecurringJournal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringJournalLine" ADD CONSTRAINT "RecurringJournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
