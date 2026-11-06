import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";
import { createOpenApiDocument } from "./openapi";
import { SwaggerModule } from "@nestjs/swagger";

async function bootstrap() {
	const app = await NestFactory.create(AppModule);
	app.enableCors({
		origin: process.env.FRONTEND_URL ?? "https://expense-tracker-aife-production.up.railway.app",
		credentials: true,
	});
	app.use(cookieParser());
	app.useGlobalPipes(
		new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
	);
	SwaggerModule.setup("docs", app, createOpenApiDocument(app));
	app.enableShutdownHooks();
	await app.listen(Number(process.env.PORT ?? 8001));
}
void bootstrap();
