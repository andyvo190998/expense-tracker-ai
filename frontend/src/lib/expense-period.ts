export function currentMonth(now = new Date()) {
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function monthRange(month: string) {
	if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
		throw new RangeError("month must use YYYY-MM");
	}
	const [year, monthNumber] = month.split("-").map(Number);
	const lastDay = new Date(year, monthNumber, 0).getDate();
	return {
		startDate: `${month}-01`,
		endDate: `${month}-${String(lastDay).padStart(2, "0")}`,
	};
}

export function pageItems<T>(items: T[], page: number) {
	return items.slice((page - 1) * 5, page * 5);
}
