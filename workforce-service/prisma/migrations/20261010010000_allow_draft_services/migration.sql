ALTER TABLE "payments" ALTER COLUMN "amount" DROP NOT NULL;
ALTER TABLE "payments" ALTER COLUMN "method" DROP NOT NULL;
ALTER TABLE "payments" DROP CONSTRAINT "payments_amount_check";
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_check" CHECK ("amount" IS NULL OR "amount" > 0);
