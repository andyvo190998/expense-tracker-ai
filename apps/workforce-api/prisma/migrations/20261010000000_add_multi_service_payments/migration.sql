ALTER TABLE "payments" ADD COLUMN "service_name" TEXT;
UPDATE "payments" SET "service_name" = 'Service';
ALTER TABLE "payments" ALTER COLUMN "service_name" SET NOT NULL;
ALTER TABLE "payments" DROP CONSTRAINT "payments_service_session_id_key";
CREATE INDEX "payments_service_session_id_idx" ON "payments"("service_session_id");
