import "reflect-metadata";

import { writeFile } from "node:fs/promises";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import { createOpenApiDocument } from "./openapi";

async function exportOpenApi() {
	const output = process.argv.at(-1);
	if (!output) throw new Error("Output path is required");
	const app = await NestFactory.create(AppModule, { logger: false });
	await writeFile(output, `${JSON.stringify(createOpenApiDocument(app), null, 2)}\n`);
	await app.close();
}

void exportOpenApi();
