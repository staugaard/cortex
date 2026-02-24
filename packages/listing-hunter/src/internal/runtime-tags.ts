type HasWindowGlobal = [typeof globalThis extends { window: infer W } ? W : never] extends [never]
	? false
	: true;

type HasBunGlobal = [typeof globalThis extends { Bun: infer B } ? B : never] extends [never]
	? false
	: true;

export type WebRuntimeFlag = HasWindowGlobal;
export type BunRuntimeFlag = HasBunGlobal;

export type RequireWebRuntime<T extends true> = T;
export type RequireBunRuntime<T extends true> = T;
