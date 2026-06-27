// Driven port: typed access to persisted settings. The store holds a single live
// settings object; `update` mutates it and persists. Wraps loadData/saveData.
export interface SettingsStore<T> {
	get(): T;
	update(mutate: (settings: T) => void): Promise<void>;
	save(): Promise<void>;
}
