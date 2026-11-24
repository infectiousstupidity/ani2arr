/** Coalesces single-item loads made close together into one batched call. */

export interface BatchLoader<Key, Value> {
	load(key: Key): Promise<Value>;
}

type Waiter<Value> = {
	resolve: (value: Value) => void;
	reject: (error: unknown) => void;
};

/**
 * `loadMany` receives unique keys and must return values in the same order.
 * If it throws, every load in that batch rejects with the same error.
 */
export function createBatchLoader<Key, Value>(input: {
	loadMany: (keys: Key[]) => Promise<Value[]>;
	keyOf: (key: Key) => string | number;
	/** How long to wait for more loads before sending the batch. */
	windowMs: number;
	maxBatchSize?: number;
}): BatchLoader<Key, Value> {
	let pending = new Map<string | number, { key: Key; waiters: Waiter<Value>[] }>();
	let timer: ReturnType<typeof setTimeout> | null = null;

	const send = (batch: typeof pending): void => {
		const entries = [...batch.values()];
		input.loadMany(entries.map((entry) => entry.key)).then(
			(values) => {
				for (const [index, entry] of entries.entries()) {
					if (index < values.length) {
						for (const waiter of entry.waiters) waiter.resolve(values[index]!);
					} else {
						const error = new Error("Batch load returned too few values.");
						for (const waiter of entry.waiters) waiter.reject(error);
					}
				}
			},
			(error: unknown) => {
				for (const entry of entries) {
					for (const waiter of entry.waiters) waiter.reject(error);
				}
			},
		);
	};

	const flush = (): void => {
		timer = null;
		const batch = pending;
		pending = new Map();
		const max = input.maxBatchSize ?? Number.POSITIVE_INFINITY;
		let chunk = new Map<string | number, { key: Key; waiters: Waiter<Value>[] }>();
		for (const [id, entry] of batch) {
			chunk.set(id, entry);
			if (chunk.size >= max) {
				send(chunk);
				chunk = new Map();
			}
		}
		if (chunk.size > 0) send(chunk);
	};

	return {
		load(key) {
			return new Promise<Value>((resolve, reject) => {
				const id = input.keyOf(key);
				const entry = pending.get(id);
				if (entry) entry.waiters.push({ resolve, reject });
				else pending.set(id, { key, waiters: [{ resolve, reject }] });
				timer ??= setTimeout(flush, input.windowMs);
			});
		},
	};
}
