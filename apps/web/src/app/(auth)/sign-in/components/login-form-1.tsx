"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";

const schema = z.object({ email: z.string().email(), password: z.string().min(12) });
type Values = z.infer<typeof schema>;

export function LoginForm1({ className, ...props }: React.ComponentProps<"div">) {
	const auth = useAuth();
	const router = useRouter();
	const form = useForm<Values>({
		resolver: zodResolver(schema),
		defaultValues: { email: "", password: "" },
	});
	async function submit(data: Values) {
		try {
			const user = await auth.login(data);
			router.replace(user.role === "admin" ? "/admin/users" : "/chi-tieu");
		} catch (error) {
			form.setError("root", {
				message: error instanceof Error ? error.message : "Login failed.",
			});
		}
	}
	return (
		<div className={cn("flex flex-col gap-6", className)} {...props}>
			<Card>
				<CardHeader className="text-center">
					<CardTitle>Welcome back</CardTitle>
					<CardDescription>Enter your credentials.</CardDescription>
				</CardHeader>
				<CardContent>
					<Form {...form}>
						<form onSubmit={form.handleSubmit(submit)} className="grid gap-4">
							<FormField
								control={form.control}
								name="email"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Email</FormLabel>
										<FormControl>
											<Input type="email" autoComplete="email" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="password"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Password</FormLabel>
										<FormControl>
											<Input
												type="password"
												autoComplete="current-password"
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							{form.formState.errors.root ? (
								<p className="text-sm text-destructive">
									{form.formState.errors.root.message}
								</p>
							) : null}
							<Button type="submit" disabled={form.formState.isSubmitting}>
								Sign in
							</Button>
							<p className="text-center text-sm">
								No account?{" "}
								<a href="/sign-up" className="underline">
									Sign up
								</a>
							</p>
						</form>
					</Form>
				</CardContent>
			</Card>
		</div>
	);
}
