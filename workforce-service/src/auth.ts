import {
	CanActivate,
	ExecutionContext,
	ForbiddenException,
	Injectable,
	UnauthorizedException,
	createParamDecorator,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import { timingSafeEqual } from "node:crypto";

type MerchantRequest = Request & { merchantId?: string };

@Injectable()
export class AuthGuard implements CanActivate {
	constructor(private readonly jwt: JwtService) {}
	async canActivate(context: ExecutionContext) {
		const request = context.switchToHttp().getRequest<MerchantRequest>();
		const token = request.cookies?.[process.env.ACCESS_COOKIE_NAME ?? "access_token"];
		if (!token) throw new UnauthorizedException({ code: "UNAUTHENTICATED" });
		try {
			const claims = await this.jwt.verifyAsync<{ sub: string; role: string; type: string }>(
				token,
				{
					secret: process.env.JWT_SECRET ?? "development-only-signing-secret-change-me",
					issuer: process.env.JWT_ISSUER ?? "expense-tracker-api",
					audience: process.env.JWT_AUDIENCE ?? "expense-tracker-web",
					algorithms: ["HS256"],
				},
			);
			if (claims.role !== "merchant" || claims.type !== "access") throw new Error();
			request.merchantId = claims.sub;
			return true;
		} catch {
			throw new UnauthorizedException({ code: "INVALID_ACCESS_TOKEN" });
		}
	}
}

@Injectable()
export class CsrfGuard implements CanActivate {
	canActivate(context: ExecutionContext) {
		const request = context.switchToHttp().getRequest<Request>();
		if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
		const cookie = request.cookies?.[process.env.CSRF_COOKIE_NAME ?? "csrf_token"];
		const header = request.header("x-csrf-token");
		if (
			!cookie ||
			!header ||
			cookie.length !== header.length ||
			!timingSafeEqual(Buffer.from(cookie), Buffer.from(header))
		)
			throw new ForbiddenException({ code: "CSRF_FAILED" });
		return true;
	}
}

export const MerchantId = createParamDecorator(
	(_: unknown, context: ExecutionContext) =>
		context.switchToHttp().getRequest<MerchantRequest>().merchantId as string,
);
