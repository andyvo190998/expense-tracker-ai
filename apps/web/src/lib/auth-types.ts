export type UserRole = "admin" | "merchant";

export type AuthUser = {
	id: string;
	email: string;
	name: string;
	role: UserRole;
	is_active: boolean;
	monthly_expense_target: string;
};

export type LoginInput = { email: string; password: string };
export type RegisterInput = { email: string; name: string; password: string };
export type UserProfileUpdate = { name: string; monthly_expense_target: string };

export class AuthError extends Error {
	constructor(
		public readonly status: number,
		public readonly code: string,
		message: string,
	) {
		super(message);
	}
}
