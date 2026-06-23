// Insertable Mermaid snippets for the editor palette, grouped by category.
// Pure data — the view renders these as clickable buttons that insert `snippet`
// at the cursor. Inspired by the Mermaid Tools plugin's element palette.

export interface Snippet {
	label: string;
	snippet: string;
}

export interface SnippetCategory {
	name: string;
	// A full diagram skeleton inserted when the category header's "scaffold"
	// action is used (and a sensible starting point shown first).
	scaffold: string;
	items: Snippet[];
}

export const SNIPPET_CATEGORIES: SnippetCategory[] = [
	{
		name: "Flowchart",
		scaffold: "flowchart TD\n  A[Start] --> B{Decision}\n  B -->|Yes| C[OK]\n  B -->|No| D[Stop]",
		items: [
			{ label: "Node", snippet: "id[Label]" },
			{ label: "Round", snippet: "id(Label)" },
			{ label: "Decision", snippet: "id{Label}" },
			{ label: "Circle", snippet: "id((Label))" },
			{ label: "Arrow", snippet: "A --> B" },
			{ label: "Labelled arrow", snippet: "A -->|text| B" },
			{ label: "Dotted", snippet: "A -.-> B" },
			{ label: "Thick", snippet: "A ==> B" },
			{ label: "Subgraph", snippet: "subgraph title\n  A --> B\nend" },
		],
	},
	{
		name: "Sequence",
		scaffold:
			"sequenceDiagram\n  participant A\n  participant B\n  A->>B: Request\n  B-->>A: Response",
		items: [
			{ label: "Participant", snippet: "participant A" },
			{ label: "Actor", snippet: "actor A" },
			{ label: "Sync call", snippet: "A->>B: message" },
			{ label: "Reply", snippet: "B-->>A: message" },
			{ label: "Activate", snippet: "activate A" },
			{ label: "Note", snippet: "Note over A,B: text" },
			{ label: "Loop", snippet: "loop every minute\n  A->>B: ping\nend" },
			{ label: "Alt", snippet: "alt success\n  A->>B: ok\nelse failure\n  A->>B: no\nend" },
		],
	},
	{
		name: "Class",
		scaffold:
			"classDiagram\n  class Animal {\n    +String name\n    +move()\n  }\n  Animal <|-- Dog",
		items: [
			{ label: "Class", snippet: "class Name {\n  +field\n  +method()\n}" },
			{ label: "Inheritance", snippet: "A <|-- B" },
			{ label: "Composition", snippet: "A *-- B" },
			{ label: "Aggregation", snippet: "A o-- B" },
			{ label: "Association", snippet: "A --> B" },
		],
	},
	{
		name: "State",
		scaffold:
			"stateDiagram-v2\n  [*] --> Idle\n  Idle --> Running: start\n  Running --> [*]: stop",
		items: [
			{ label: "Transition", snippet: "A --> B: event" },
			{ label: "Start", snippet: "[*] --> A" },
			{ label: "End", snippet: "A --> [*]" },
			{ label: "Composite", snippet: "state A {\n  [*] --> B\n}" },
		],
	},
	{
		name: "ER",
		scaffold:
			"erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  ORDER ||--|{ LINE_ITEM : contains",
		items: [
			{ label: "One-to-many", snippet: "A ||--o{ B : label" },
			{ label: "One-to-one", snippet: "A ||--|| B : label" },
			{ label: "Entity", snippet: "ENTITY {\n  string name\n  int id\n}" },
		],
	},
	{
		name: "Gantt",
		scaffold:
			"gantt\n  title Project\n  dateFormat YYYY-MM-DD\n  section Phase 1\n  Task A :a1, 2024-01-01, 7d",
		items: [
			{ label: "Section", snippet: "section Name" },
			{ label: "Task", snippet: "Task name :id, 2024-01-01, 5d" },
			{ label: "Milestone", snippet: "Milestone :milestone, 2024-01-01, 0d" },
		],
	},
	{
		name: "Pie",
		scaffold: 'pie title Pets\n  "Dogs" : 40\n  "Cats" : 35\n  "Birds" : 25',
		items: [{ label: "Slice", snippet: '"Label" : 30' }],
	},
	{
		name: "Mindmap",
		scaffold: "mindmap\n  root((central idea))\n    Branch A\n    Branch B",
		items: [
			{ label: "Root", snippet: "root((idea))" },
			{ label: "Branch", snippet: "  Branch" },
		],
	},
];
