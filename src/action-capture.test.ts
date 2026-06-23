import { describe, it, expect } from "vitest";
import {
	captureActions,
	hasActions,
	hasTodoHeading,
	insertUnderTodoHeading,
} from "./action-capture";

const opts = {
	kanbanFile: "ToDo Auto",
	noteBasename: "Note",
};

describe("captureActions", () => {
	it("rewrites each @action marker to an ACTION link and captures a canonical task", () => {
		const { rewritten, captured } = captureActions(
			"# Notes\n@action call Bob\n@action: email Alice\n",
			opts,
		);

		expect(rewritten).toContain("**[[ToDo Auto#ToDo|ACTION]]:** call Bob");
		expect(rewritten).toContain(
			"**[[ToDo Auto#ToDo|ACTION]]:** email Alice",
		);
		expect(rewritten).not.toContain("@action");
		expect(rewritten).not.toContain("#^");

		expect(captured).toHaveLength(2);
		expect(captured[0]).toEqual({
			text: "call Bob",
			entry: "- [ ] call Bob [[Note]]",
		});
	});

	it("captures nothing when there are no markers", () => {
		const text = "# Notes\njust text\n";
		const { rewritten, captured } = captureActions(text, opts);
		expect(rewritten).toBe(text);
		expect(captured).toEqual([]);
	});
});

describe("board grammar", () => {
	it("detects @action markers", () => {
		expect(hasActions("a @action do x")).toBe(true);
		expect(hasActions("nothing here")).toBe(false);
	});

	it("detects a ## ToDo heading", () => {
		expect(hasTodoHeading("## ToDo\n")).toBe(true);
		expect(hasTodoHeading("## Tasks\n")).toBe(false);
	});

	it("inserts entries directly beneath the ToDo heading", () => {
		expect(insertUnderTodoHeading("## ToDo\n- old\n", ["- a", "- b"])).toBe(
			"## ToDo\n- a\n- b\n- old\n",
		);
	});
});
