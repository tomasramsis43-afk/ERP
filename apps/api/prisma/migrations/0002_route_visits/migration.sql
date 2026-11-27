-- CreateEnum
CREATE TYPE "VisitOutcome" AS ENUM ('SALE', 'COLLECTION', 'NO_ORDER', 'SHOP_CLOSED', 'NOT_REACHED');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "routeSequence" INTEGER;

-- CreateTable
CREATE TABLE "RouteVisit" (
    "id" TEXT NOT NULL,
    "routeId" TEXT,
    "customerId" TEXT NOT NULL,
    "representativeId" TEXT NOT NULL,
    "visitDate" DATE NOT NULL,
    "visitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcome" "VisitOutcome" NOT NULL,
    "note" TEXT,
    "createdById" TEXT,

    CONSTRAINT "RouteVisit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RouteVisit_visitDate_idx" ON "RouteVisit"("visitDate");

-- CreateIndex
CREATE INDEX "RouteVisit_routeId_visitDate_idx" ON "RouteVisit"("routeId", "visitDate");

-- CreateIndex
CREATE INDEX "RouteVisit_customerId_idx" ON "RouteVisit"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "RouteVisit_representativeId_customerId_visitDate_key" ON "RouteVisit"("representativeId", "customerId", "visitDate");

-- AddForeignKey
ALTER TABLE "RouteVisit" ADD CONSTRAINT "RouteVisit_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteVisit" ADD CONSTRAINT "RouteVisit_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteVisit" ADD CONSTRAINT "RouteVisit_representativeId_fkey" FOREIGN KEY ("representativeId") REFERENCES "Representative"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
