-- Ordering availability belongs to an event and is independent from its lifecycle.
DO $$ BEGIN
    CREATE TYPE "OrderingStatus" AS ENUM ('OPEN', 'MANUALLY_CLOSED', 'LIMIT_REACHED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "Event"
    ADD COLUMN IF NOT EXISTS "orderingStatus" "OrderingStatus" NOT NULL DEFAULT 'OPEN';

-- The original event-numbering migration placed every legacy order for a vendor
-- in one "Previous Orders" event. Re-split only those synthetic containers by
-- Malaysia calendar date and by order-number resets within a date. This keeps
-- every order ID unchanged and preserves its original sequence.
DO $$
DECLARE
    legacy_event RECORD;
    segment RECORD;
    first_segment BOOLEAN;
    target_event_id TEXT;
    segment_name TEXT;
BEGIN
    CREATE TEMP TABLE IF NOT EXISTS legacy_order_assignment (
        order_id TEXT PRIMARY KEY,
        event_date DATE NOT NULL,
        event_segment INTEGER NOT NULL,
        event_order_number INTEGER NOT NULL,
        created_at TIMESTAMP(3) NOT NULL
    ) ON COMMIT DROP;

    FOR legacy_event IN
        SELECT e.*
        FROM "Event" e
        WHERE e."id" LIKE 'previous-orders-%'
           OR e."eventName" = 'Previous Orders'
    LOOP
        first_segment := TRUE;
        TRUNCATE legacy_order_assignment;

        INSERT INTO legacy_order_assignment (
            order_id, event_date, event_segment, event_order_number, created_at
        )
        WITH ordered AS (
            SELECT
                o."id",
                o."createdAt",
                o."displayNumber",
                (o."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kuala_Lumpur')::date AS event_date,
                lag(o."displayNumber") OVER (
                    PARTITION BY (o."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kuala_Lumpur')::date
                    ORDER BY o."createdAt", o."id"
                ) AS previous_number
            FROM "Order" o
            WHERE o."eventId" = legacy_event."id"
        ), grouped AS (
            SELECT *,
                sum(CASE
                    WHEN previous_number IS NOT NULL AND "displayNumber" <= previous_number THEN 1
                    ELSE 0
                END) OVER (
                    PARTITION BY event_date ORDER BY "createdAt", "id"
                )::integer AS event_segment
            FROM ordered
        )
        SELECT
            "id",
            event_date,
            event_segment,
            row_number() OVER (
                PARTITION BY event_date, event_segment ORDER BY "createdAt", "id"
            )::integer,
            "createdAt"
        FROM grouped;

        FOR segment IN
            SELECT
                event_date,
                event_segment,
                min(created_at) AS first_created_at,
                count(*)::integer AS order_count
            FROM legacy_order_assignment
            GROUP BY event_date, event_segment
            ORDER BY event_date, first_created_at
        LOOP
            segment_name := to_char(segment.event_date, 'FMDD FMMonth YYYY');

            IF first_segment THEN
                target_event_id := legacy_event."id";
                UPDATE "Event"
                SET "eventName" = segment_name,
                    "eventDate" = segment.event_date,
                    "status" = 'ARCHIVED',
                    "orderingStatus" = 'MANUALLY_CLOSED',
                    "nextOrderNumber" = segment.order_count + 1,
                    "updatedAt" = CURRENT_TIMESTAMP
                WHERE "id" = target_event_id;
                first_segment := FALSE;
            ELSE
                target_event_id := 'historical-' || md5(
                    legacy_event."vendorId" || ':' || segment.event_date::text || ':' || segment.event_segment::text
                );
                INSERT INTO "Event" (
                    "id", "vendorId", "eventName", "eventDate", "status", "orderingStatus",
                    "nextOrderNumber", "createdAt", "updatedAt"
                ) VALUES (
                    target_event_id, legacy_event."vendorId", segment_name, segment.event_date,
                    'ARCHIVED', 'MANUALLY_CLOSED', segment.order_count + 1,
                    segment.first_created_at, CURRENT_TIMESTAMP
                )
                ON CONFLICT ("id") DO UPDATE SET
                    "eventName" = EXCLUDED."eventName",
                    "eventDate" = EXCLUDED."eventDate",
                    "nextOrderNumber" = EXCLUDED."nextOrderNumber",
                    "updatedAt" = CURRENT_TIMESTAMP;
            END IF;

            WITH numbered AS (
                SELECT order_id, event_order_number
                FROM legacy_order_assignment
                WHERE event_date = segment.event_date
                  AND event_segment = segment.event_segment
            )
            UPDATE "Order" o
            SET "eventId" = target_event_id,
                "eventOrderNumber" = numbered.event_order_number,
                "displayNumber" = numbered.event_order_number
            FROM numbered
            WHERE o."id" = numbered.order_id;
        END LOOP;
    END LOOP;
END $$;
