"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
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

const targetPattern = /^\d{1,10}(\.\d{1,2})?$/;

const userFormSchema = z.object({
	name: z.string().trim().min(1, "Name is required").max(200),
	monthly_expense_target: z
		.string()
		.trim()
		.regex(targetPattern, "Enter a positive amount with up to two decimal places")
		.refine((value) => Number(value) > 0, "Monthly expense target must be greater than zero"),
});

type UserFormValues = z.infer<typeof userFormSchema>;

export default function UserSettingsPage() {
	const { updateProfile, user } = useAuth();
	const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
	const form = useForm<UserFormValues>({
		resolver: zodResolver(userFormSchema),
		defaultValues: {
			name: user?.name ?? "",
			monthly_expense_target: user?.monthly_expense_target ?? "",
		},
	});

	async function onSubmit(data: UserFormValues) {
		setStatus("idle");
		try {
			const updated = await updateProfile(data);
			form.reset({
				name: updated.name,
				monthly_expense_target: updated.monthly_expense_target,
			});
			setStatus("success");
		} catch {
			setStatus("error");
		}
	}

	return (
		<div className="px-4 lg:px-6">
			<Form {...form}>
				<form onSubmit={form.handleSubmit(onSubmit)}>
					<Card className="max-w-2xl">
						<CardHeader>
							<CardTitle>Profile settings</CardTitle>
							<CardDescription>
								Update your display name and monthly expense target.
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-6">
							<FormItem>
								<FormLabel htmlFor="email">Email</FormLabel>
								<Input id="email" type="email" value={user?.email ?? ""} disabled />
							</FormItem>
							<FormField
								control={form.control}
								name="name"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Name</FormLabel>
										<FormControl>
											<Input autoComplete="name" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="monthly_expense_target"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Monthly expense target</FormLabel>
										<FormControl>
											<Input
												inputMode="decimal"
												placeholder="500.00"
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							{status === "success" ? (
								<p role="status" className="text-sm text-muted-foreground">Profile updated.</p>
							) : status === "error" ? (
								<p role="alert" className="text-sm text-destructive">Could not update profile.</p>
							) : null}
						</CardContent>
						<CardFooter>
							<Button type="submit" disabled={form.formState.isSubmitting}>
								{form.formState.isSubmitting ? "Saving..." : "Save changes"}
							</Button>
						</CardFooter>
					</Card>
				</form>
			</Form>
		</div>
	);
}
