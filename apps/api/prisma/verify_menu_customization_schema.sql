SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'MenuItem'
  AND column_name IN ('optionGroups', 'remarksEnabled')
ORDER BY column_name;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'OrderItem'
  AND column_name IN ('selectedOptions')
ORDER BY column_name;

SELECT 'MenuItem' AS table_name, COUNT(*)::int AS row_count FROM "MenuItem"
UNION ALL
SELECT 'Order' AS table_name, COUNT(*)::int AS row_count FROM "Order"
UNION ALL
SELECT 'OrderItem' AS table_name, COUNT(*)::int AS row_count FROM "OrderItem";

