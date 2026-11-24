export class KeyedTaskQueue {
	private readonly tails = new Map<string, Promise<void>>();

	public run<T>(key: string, task: () => Promise<T>): Promise<T> {
		const result = (this.tails.get(key) ?? Promise.resolve()).then(task);
		const tail = result.then(
			() => {},
			() => {},
		);
		this.tails.set(key, tail);
		void tail.then(() => {
			if (this.tails.get(key) === tail) this.tails.delete(key);
		});
		return result;
	}

	public async drain(): Promise<void> {
		await Promise.all(this.tails.values());
	}
}
