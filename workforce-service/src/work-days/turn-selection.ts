export type RosterEntry = { employeeId: string; position: number; isAvailable: boolean };

export function selectNextEmployee(
	roster: RosterEntry[],
	nextPosition: number,
	busy: Set<string>,
	employeeId?: string,
) {
	if (!roster.length) return null;
	const ordered = [...roster].sort((a, b) => a.position - b.position);
	if (employeeId) {
		const selected = ordered.find((entry) => entry.employeeId === employeeId);
		return selected?.isAvailable && !busy.has(employeeId)
			? { employeeId, nextPosition }
			: null;
	}
	for (let offset = 0; offset < ordered.length; offset++) {
		const entry = ordered[(nextPosition + offset) % ordered.length];
		if (entry.isAvailable && !busy.has(entry.employeeId)) {
			return {
				employeeId: entry.employeeId,
				nextPosition: (entry.position + 1) % ordered.length,
			};
		}
	}
	return null;
}
