export type UserRole = "admin" | "merchant";

export type AuthUser = {
	id: string;
	email: string;
	name: string;
	role: UserRole;
	is_active: boolean;
};

export type LoginInput = { email: string; password: string };
export type RegisterInput = { email: string; name: string; password: string };

export class AuthError extends Error {
	constructor(
		public readonly status: number,
		public readonly code: string,
		message: string,
	) {
		super(message);
	}
}
