import { LoginForm1 } from "./components/login-form-1";

export default function Page() {
	return (
		<div className="bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
			<LoginForm1 className="w-full max-w-sm" />
		</div>
	);
}
