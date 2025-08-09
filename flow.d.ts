export function flow<T = any>(
	taskName: string,
	taskFn: () => Promise<T> | T,
): Promise<T>;
export function parallel<T = any>(
	name: string,
	count: number,
	producer: (index: number) => Promise<T> | T,
): Promise<T[]>;
export function all<T = any>(
	name: string,
	producers: Array<() => Promise<T> | T>,
): Promise<T[]>;
export function queue(
	options: { name: string; fn: () => Promise<any> | any; retries?: number },
	userFn?: () => Promise<any> | any,
): Promise<any>;
export function deferred<F extends (...args: any[]) => any>(
	taskName: string,
	taskFn: F,
): (...args: Parameters<F>) => ReturnType<F>;
export type ProcessorOptions<T, R, S = any> = {
	processor: (data: T, passInfo: { pass: number }) => Promise<R>;
	generateSubtaskData: (originalResult: R, pass: number) => T[];
	storeSubtaskResult?: (data: T, result: R) => void;
	maxPasses: number;
};
export function recursiveProcessor<T, R, S = any>(
	initialData: T,
	options: ProcessorOptions<T, R, S>,
): Promise<R>;
