-- CreateTable
CREATE TABLE "CreditOverride" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "balanceBefore" DECIMAL(18,2) NOT NULL,
    "invoiceTotal" DECIMAL(18,2) NOT NULL,
    "creditLimit" DECIMAL(18,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "approvedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreditOverride_invoiceId_key" ON "CreditOverride"("invoiceId");

-- CreateIndex
CREATE INDEX "CreditOverride_customerId_createdAt_idx" ON "CreditOverride"("customerId", "createdAt");

-- AddForeignKey
ALTER TABLE "CreditOverride" ADD CONSTRAINT "CreditOverride_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SalesInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
