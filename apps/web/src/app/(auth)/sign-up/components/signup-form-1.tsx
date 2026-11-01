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

const schema = z
	.object({
		name: z.string().trim().min(1),
		email: z.string().email(),
		password: z.string().min(12),
		confirmPassword: z.string().min(12),
	})
	.refine((data) => data.password === data.confirmPassword, {
		message: "Passwords do not match",
		path: ["confirmPassword"],
	});
type Values = z.infer<typeof schema>;

export function SignupForm1({ className, ...props }: React.ComponentProps<"div">) {
	const auth = useAuth();
	const router = useRouter();
	const form = useForm<Values>({
		resolver: zodResolver(schema),
		defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
	});
	async function submit(data: Values) {
		try {
			await auth.register({ name: data.name, email: data.email, password: data.password });
			router.replace("/chi-tieu");
		} catch (error) {
			form.setError("root", {
				message: error instanceof Error ? error.message : "Registration failed.",
			});
		}
	}
	const field = (name: keyof Values, label: string, type = "text") => (
		<FormField
			control={form.control}
			name={name}
			render={({ field: input }) => (
				<FormItem>
					<FormLabel>{label}</FormLabel>
					<FormControl>
						<Input type={type} {...input} />
					</FormControl>
					<FormMessage />
				</FormItem>
			)}
		/>
	);
	return (
		<div className={cn("flex flex-col gap-6", className)} {...props}>
			<Card>
				<CardHeader className="text-center">
					<CardTitle>Create account</CardTitle>
					<CardDescription>Register as a merchant.</CardDescription>
				</CardHeader>
				<CardContent>
					<Form {...form}>
						<form onSubmit={form.handleSubmit(submit)} className="grid gap-4">
							{field("name", "Name")}
							{field("email", "Email", "email")}
							{field("password", "Password", "password")}
							{field("confirmPassword", "Confirm password", "password")}
							{form.formState.errors.root ? (
								<p className="text-sm text-destructive">
									{form.formState.errors.root.message}
								</p>
							) : null}
							<Button type="submit" disabled={form.formState.isSubmitting}>
								Create account
							</Button>
							<p className="text-center text-sm">
								Already registered?{" "}
								<a href="/sign-in" className="underline">
									Sign in
								</a>
							</p>
						</form>
					</Form>
				</CardContent>
			</Card>
		</div>
	);
}
