ALTER TABLE "service_sessions" ADD COLUMN "served_number" INTEGER;

WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY "work_day_id", "employee_id"
    ORDER BY "sequence_number"
  ) AS number
  FROM "service_sessions"
)
UPDATE "service_sessions"
SET "served_number" = numbered.number
FROM numbered
WHERE "service_sessions".id = numbered.id;

ALTER TABLE "service_sessions" ALTER COLUMN "served_number" SET NOT NULL;
ALTER TABLE "service_sessions" ADD CONSTRAINT "service_sessions_served_number_positive" CHECK ("served_number" > 0);
CREATE UNIQUE INDEX "service_sessions_work_day_id_employee_id_served_number_key"
ON "service_sessions"("work_day_id", "employee_id", "served_number");
