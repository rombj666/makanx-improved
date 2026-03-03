-- Update existing PENDING orders to PREPARING
UPDATE "Order" 
SET status = 'PREPARING' 
WHERE status = 'PENDING';

-- Update existing CANCELLED orders to COMPLETED (since CANCELLED is being removed)
UPDATE "Order" 
SET status = 'COMPLETED' 
WHERE status = 'CANCELLED';