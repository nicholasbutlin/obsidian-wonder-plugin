import { describe, it, expect } from "vitest";
import {
	formatDue,
	formatCreated,
	formatHiddenCreated,
	formatDone,
	newTask,
} from "./task-format";

describe("task-format vocabulary", () => {
	it("formats a due date with the 📅 token", () => {
		expect(formatDue("2026-06-20")).toBe("📅 2026-06-20");
	});

	it("formats a created date with the ➕ token", () => {
		expect(formatCreated("2026-06-18")).toBe("➕ 2026-06-18");
	});

	it("formats a hidden created date with the ➕ token", () => {
		expect(formatHiddenCreated("2026-06-18")).toBe("<!-- ➕ 2026-06-18 -->");
	});

	it("formats a done date with the ✅ token", () => {
		expect(formatDone("2026-06-19")).toBe("✅ 2026-06-19");
	});

	it("builds a canonical open task line", () => {
		expect(newTask({ text: "call Bob" })).toBe("- [ ] call Bob");
	});

	it("trims surrounding whitespace from the task description", () => {
		expect(newTask({ text: "  email Alice  " })).toBe("- [ ] email Alice");
	});
});
