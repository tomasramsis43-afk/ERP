-- CreateTable
CREATE TABLE "StockLayer" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "remaining" DECIMAL(18,4) NOT NULL,
    "unitCost" DECIMAL(18,4) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT,
    "batchNo" TEXT,
    "expiryDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockLayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockLayer_productId_warehouseId_receivedAt_idx" ON "StockLayer"("productId", "warehouseId", "receivedAt");

-- CreateIndex
CREATE INDEX "StockLayer_source_sourceId_idx" ON "StockLayer"("source", "sourceId");

-- AddForeignKey
ALTER TABLE "StockLayer" ADD CONSTRAINT "StockLayer_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLayer" ADD CONSTRAINT "StockLayer_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
