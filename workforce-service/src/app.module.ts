import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { AuthGuard, CsrfGuard } from "./auth";
import { EmployeesController, SessionsController, WorkDaysController } from "./controllers";
import { EmployeesService } from "./employees.service";
import { PrismaService } from "./prisma.service";
import { WorkDaysService } from "./work-days.service";

@Module({
	imports: [JwtModule.register({})],
	controllers: [EmployeesController, WorkDaysController, SessionsController],
	providers: [
		PrismaService,
		EmployeesService,
		WorkDaysService,
		{ provide: APP_GUARD, useClass: AuthGuard },
		{ provide: APP_GUARD, useClass: CsrfGuard },
	],
})
export class AppModule {}
