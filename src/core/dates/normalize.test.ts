import { describe, it, expect } from "vitest";
import { normalizeKanbanDates } from "./normalize";

describe("normalizeKanbanDates", () => {
	it("converts a brace date to the Tasks due emoji", () => {
		expect(normalizeKanbanDates("do thing @{2026-06-20}")).toBe(
			"do thing 📅 2026-06-20",
		);
	});

	it("drops the time component from brace date-times", () => {
		expect(normalizeKanbanDates("@{2026-06-20 09:00}")).toBe("📅 2026-06-20");
		expect(normalizeKanbanDates("@{2026-06-20T09:00}")).toBe("📅 2026-06-20");
	});

	it("leaves @[[date]] reference stamps untouched", () => {
		expect(normalizeKanbanDates("done @[[2026-03-27]]")).toBe(
			"done @[[2026-03-27]]",
		);
	});

	it("converts only the brace date on a line that has both", () => {
		expect(normalizeKanbanDates("task @[[2026-03-27]] @{2026-06-20}")).toBe(
			"task @[[2026-03-27]] 📅 2026-06-20",
		);
	});

	it("is idempotent", () => {
		const once = normalizeKanbanDates("a @{2026-06-20} b @{2026-07-01}");
		expect(normalizeKanbanDates(once)).toBe(once);
	});

	it("returns the input unchanged when there are no brace dates", () => {
		const text = "# Notes\n- [ ] something 📅 2026-06-14 @[[2026-03-27]]\n";
		expect(normalizeKanbanDates(text)).toBe(text);
	});

	// Re-picking a date: Kanban can't edit a 📅 it doesn't own, so it inserts a
	// fresh @{} alongside the existing 📅. The picked date must supersede the old
	// one rather than leaving two due dates on the card.
	it("replaces an existing 📅 on a line when a new brace date is picked", () => {
		expect(
			normalizeKanbanDates("- [ ] Pay HMRC 📅 2026-06-30 #General @{2026-07-15}"),
		).toBe("- [ ] Pay HMRC #General 📅 2026-07-15");
	});

	it("only replaces the 📅 on the line that has the new brace date", () => {
		expect(
			normalizeKanbanDates(
				"- [ ] a 📅 2026-06-30\n- [ ] b 📅 2026-01-01 @{2026-07-15}",
			),
		).toBe("- [ ] a 📅 2026-06-30\n- [ ] b 📅 2026-07-15");
	});

	it("is idempotent through a replace", () => {
		const once = normalizeKanbanDates("- [ ] b 📅 2026-01-01 @{2026-07-15}");
		expect(normalizeKanbanDates(once)).toBe(once);
	});

	// Tasks reads the date on a card's main `- [ ]` line, and Kanban only renders
	// inline metadata there too. A picker date that lands on an indented
	// continuation line must be lifted to the card's main line. On a multi-line
	// card the lifted date ends in a trailing space: Kanban only displays a date
	// that ends strictly before the card's first newline, so a date sitting flush
	// against the newline (the last token) would be silently dropped.
	it("lifts a converted date to the main line with a trailing space (multi-line)", () => {
		expect(
			normalizeKanbanDates("- [ ] Policies:\n\tdetail @{2026-06-20}"),
		).toBe("- [ ] Policies: 📅 2026-06-20 \n\tdetail");
	});

	it("heals an existing 📅 stranded on a continuation line (no brace)", () => {
		expect(
			normalizeKanbanDates("- [ ] Strategy\n\t[[Plan review]] 📅 2026-06-18"),
		).toBe("- [ ] Strategy 📅 2026-06-18 \n\t[[Plan review]]");
	});

	it("heals a multi-line card whose main-line date is flush against the newline", () => {
		expect(normalizeKanbanDates("- [ ] a 📅 2026-06-30\n\tsome detail")).toBe(
			"- [ ] a 📅 2026-06-30 \n\tsome detail",
		);
	});

	it("leaves a multi-line date alone when it is already followed by content", () => {
		// The date isn't the last token, so Kanban renders it — no space needed, and
		// we must not reorder the line.
		const text = "- [ ] a 📅 2026-06-30 #tag\n\tsome detail";
		expect(normalizeKanbanDates(text)).toBe(text);
	});

	it("adds no trailing space on a single-line card", () => {
		expect(normalizeKanbanDates("- [ ] task @{2026-07-15}")).toBe(
			"- [ ] task 📅 2026-07-15",
		);
	});

	it("replaces and lifts on a re-picked multi-line card", () => {
		expect(
			normalizeKanbanDates("- [ ] task 📅 2026-01-01\n\tnote @{2026-07-15}"),
		).toBe("- [ ] task 📅 2026-07-15 \n\tnote");
	});
});
