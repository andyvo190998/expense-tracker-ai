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
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/auth-context";

const targetPattern = /^\d{1,10}(\.\d{1,2})?$/;

function emailLines(value: string): string[] {
	return value
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
}

const recipientSchema = z
	.array(z.email("Enter a valid email address on each line."))
	.max(5, "Enter up to five email addresses.");

const userFormSchema = z.object({
	notification_emails: z.string().superRefine((value, context) => {
		const result = recipientSchema.safeParse(emailLines(value));
		if (!result.success) {
			context.addIssue({ code: "custom", message: result.error.issues[0].message });
		}
	}),
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
			notification_emails: (user?.notification_emails ?? []).join("\n"),
		},
	});

	async function onSubmit(data: UserFormValues) {
		setStatus("idle");
		try {
			const updated = await updateProfile({
				...data,
				notification_emails: emailLines(data.notification_emails),
			});
			form.reset({
				name: updated.name,
				monthly_expense_target: updated.monthly_expense_target,
				notification_emails: (updated.notification_emails ?? []).join("\n"),
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
								Update your display name, monthly expense target, and notification
								emails.
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
							<FormField
								control={form.control}
								name="notification_emails"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Notification emails</FormLabel>
										<FormControl>
											<Textarea
												{...field}
												rows={4}
												autoComplete="off"
												autoCapitalize="none"
												spellCheck={false}
												placeholder="you@example.com"
											/>
										</FormControl>
										<FormDescription>
											Enter up to five addresses, one per line. Emails include
											expense amounts and your monthly budget summary. Use
											addresses you own or have permission to notify. Leave
											empty to turn off future emails. Already queued emails
											may still arrive.
										</FormDescription>
										<FormMessage role="alert" />
									</FormItem>
								)}
							/>
							{status === "success" ? (
								<p role="status" className="text-sm text-muted-foreground">
									Profile updated.
								</p>
							) : status === "error" ? (
								<p role="alert" className="text-sm text-destructive">
									Could not update profile.
								</p>
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
