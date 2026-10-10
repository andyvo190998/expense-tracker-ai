import { Prisma } from "@prisma/client";

export type RosterEntry = { employeeId: string; position: number; isAvailable: boolean };

export function roundsForServices(
	services: { amount: Prisma.Decimal | string | null; currency: string }[],
) {
	return services.filter(
		(service) =>
			service.currency === "EUR" && service.amount !== null && new Prisma.Decimal(service.amount).greaterThan(30),
	).length;
}

export function selectNextEmployee(
	roster: RosterEntry[],
	nextPosition: number,
	busy: Set<string>,
	roundsByEmployee: ReadonlyMap<string, number>,
	employeeId?: string,
) {
	if (!roster.length) return null;
	const ordered = [...roster].sort((a, b) => a.position - b.position);
	if (employeeId) {
		const selected = ordered.find((entry) => entry.employeeId === employeeId);
		if (!selected?.isAvailable || busy.has(employeeId)) return null;
		let currentEntry: RosterEntry | undefined;
		for (let offset = 0; offset < ordered.length; offset++) {
			const entry = ordered[(nextPosition + offset) % ordered.length];
			if (entry.isAvailable && !busy.has(entry.employeeId)) {
				currentEntry = entry;
				break;
			}
		}
		return {
			employeeId,
			nextPosition:
				currentEntry?.employeeId === employeeId
					? (selected.position + 1) % ordered.length
					: nextPosition,
		};
	}
	const eligible = ordered.filter((entry) => entry.isAvailable && !busy.has(entry.employeeId));
	if (!eligible.length) return null;
	const minimumRounds = Math.min(
		...eligible.map((entry) => roundsByEmployee.get(entry.employeeId) ?? 0),
	);
	for (let offset = 0; offset < ordered.length; offset++) {
		const entry = ordered[(nextPosition + offset) % ordered.length];
		if (
			entry.isAvailable &&
			!busy.has(entry.employeeId) &&
			(roundsByEmployee.get(entry.employeeId) ?? 0) === minimumRounds
		) {
			return {
				employeeId: entry.employeeId,
				nextPosition: (entry.position + 1) % ordered.length,
			};
		}
	}
	return null;
}
