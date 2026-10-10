import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { PaymentDto } from "../src/dtos";

describe("PaymentDto", () => {
	it("accepts multiple valid services", async () => {
		const dto = plainToInstance(PaymentDto, {
			services: [
				{ serviceName: "Haircut", amount: "30.00", method: "CASH" },
				{ serviceName: "Color", amount: "30.01", method: "PAYPAL" },
			],
		});

		expect(await validate(dto)).toEqual([]);
		expect(dto.services.map((service) => service.currency)).toEqual(["EUR", "EUR"]);
	});

	it.each([
		{ services: [] },
		{ services: [{ serviceName: " ", amount: "30.00", method: "CASH" }] },
		{ services: [{ serviceName: "Haircut", amount: "bad", method: "CASH" }] },
		{ services: [{ serviceName: "Haircut", amount: "40.00", currency: "USD", method: "CASH" }] },
	])("rejects invalid service collections", async (input) => {
		expect(await validate(plainToInstance(PaymentDto, input))).not.toEqual([]);
	});
});
