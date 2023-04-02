import { createFromReadableStream } from "react-server-dom-webpack/client.browser";
import { hydrateRoot } from "react-dom/client";
import {
	createElement,
	startTransition,
	use,
	useEffect,
	useState,
	useTransition,
} from "react";

import "../devtools/devtools.client";

const decoder = new TextDecoder();

declare global {
	interface Window {
		router: {
			push(url: string): void;
			replace(url: string): void;
		};
		init_rsc: ReadableStream<Uint8Array> | null;
		rsc_chunk(chunk: string): Promise<void>;
	}
}

async function mount() {
	let callbacks: (() => void)[] = [];

	function createHrefFromUrl(
		url: Pick<URL, "pathname" | "search" | "hash">,
		includeHash: boolean = true,
	): string {
		return url.pathname + url.search + (includeHash ? url.hash : "");
	}

	const router = {
		push(url: string) {
			window.history.pushState({}, "", url);
			callbacks.forEach((cb) => cb());
		},
		replace(url: string) {
			window.history.replaceState({}, "", url);
			callbacks.forEach((cb) => cb());
		},
	};

	window.router = router;

	async function fetchFromServer(url: string) {
		let stream;
		if (window.init_rsc) {
			stream = window.init_rsc;
			self.init_rsc = null;
		} else {
			stream = await fetch(`/__rsc${url}`).then((res) => res.body!);
		}

		let previousChunkTime: number | null = null;
		let transformStream = new TransformStream({
			transform(chunk, controller) {
				const currentTime = Date.now();

				if (previousChunkTime !== null) {
					const timeDifference = currentTime - previousChunkTime;
					console.log(
						`Time difference from previous chunk: ${timeDifference}ms`,
					);
				} else {
					console.log("Received the first chunk");
				}

				console.log(`Chunk: ${decoder.decode(chunk)}`);
				previousChunkTime = currentTime;

				// Pass the chunk along the stream without modification
				controller.enqueue(chunk);
			},
		});

		return await createFromReadableStream(stream.pipeThrough(transformStream), {
			callServer(...args: any[]) {
				console.log(args);
				throw new Error("Not implemented");
			},
		});
	}

	const responseCache = new Map<string, any>();

	function Router() {
		const [url, setUrl] = useState(() =>
			createHrefFromUrl(new URL(location.href)),
		);

		useEffect(() => {
			function navigate() {
				startTransition(() => {
					setUrl(createHrefFromUrl(new URL(location.href)));
				});
			}

			callbacks.push(navigate);
			window.addEventListener("popstate", navigate);
			return () => {
				callbacks = callbacks.filter((cb) => cb !== navigate);
				window.removeEventListener("popstate", navigate);
			};
		}, []);

		return <ServerResponse url={url} />;
	}

	function ServerResponse({ url }: { url: string }) {
		if (!responseCache.has(url)) {
			responseCache.set(url, fetchFromServer(url));
		}
		return use(responseCache.get(url)) as any;
	}

	startTransition(() => {
		hydrateRoot(document.body!, createElement(Router));
	});
}

const cache = new Map<string, any>();

(globalThis as any).__webpack_chunk_load__ = async (chunk: string) => {
	console.log("Loading chunk", chunk);
	cache.set(chunk, await import(/* @vite-ignore */ chunk));
};

(globalThis as any).__webpack_require__ = (id: string) => {
	console.log("Requiring chunk", id);
	if (!cache.has(id)) throw new Error(`Module ${id} not found`);
	return cache.get(id);
};

mount().catch((err) => console.error(err));