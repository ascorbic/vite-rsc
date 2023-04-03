import React, {
	startTransition,
	StrictMode,
	use,
	useMemo,
	useState,
} from "react";
import {
	createFromFetch,
	createFromReadableStream,
	encodeReply,
} from "react-server-dom-webpack/client.browser";
import { hydrateRoot } from "react-dom/client";
import { createBrowserHistory, createPath } from "history";

import "./client/Router";

import "~/root.css";
import { RouterAPI, RouterContext } from "./client";

const decoder = new TextDecoder();

async function callServer(id: string, args: any[]) {
	const actionId = id;

	const response = fetch("/__rsf" + createPath(location), {
		method: "POST",
		headers: { Accept: "text/x-component", "x-action": actionId },
		body: await encodeReply(args),
	});

	return createFromFetch(response);
}

declare global {
	interface Window {
		init_rsc: ReadableStream<Uint8Array> | null;
		rsc_chunk(chunk: string): Promise<void>;
	}
}

async function mount() {
	async function createFromRSCStream(
		stream: ReadableStream | Promise<ReadableStream>,
		config: any,
	) {
		stream = await stream;
		if (import.meta.env.DEV) {
			const devtoolsStream = createDevtoolsStream();
			stream = stream.pipeThrough(devtoolsStream);
		}

		return createFromReadableStream(stream, config);
	}

	const responseCache = new Map<string, any>();

	function fetchRSCStream(url: string) {
		let stream;
		// Ideally we should have a readable stream inlined in the HTML
		if (window.init_rsc) {
			stream = window.init_rsc;
			self.init_rsc = null;
		} else {
			stream = fetch(`/__rsc${url}`, {
				headers: {
					Accept: "text/x-component",
				},
			}).then((res) => res.body!);
		}

		return stream;
	}

	function useRSCResponse(url: string) {
		if (!responseCache.has(url)) {
			responseCache.set(
				url,
				createFromRSCStream(fetchRSCStream(url), {
					callServer,
				}),
			);
		}
		return responseCache.get(url);
	}

	function Root() {
		const [url, setURL] = useState(() => createPath(new URL(location.href)));
		const response = useRSCResponse(url);
		const root = use<React.ReactElement>(response);
		const router = useMemo(() => {
			const history = createBrowserHistory();
			return {
				push: (url: string) => {
					history.push(url);
					startTransition(() => {
						setURL(url);
					});
				},
				replace: (url: string) => {
					history.replace(url);
					startTransition(() => {
						setURL(url);
					});
				},
			} satisfies RouterAPI;
		}, [setURL]);
		return (
			<RouterContext.Provider value={router}>{root}</RouterContext.Provider>
		);
	}

	startTransition(() => {
		hydrateRoot(
			document,
			<StrictMode>
				<Root />
			</StrictMode>,
			{
				onRecoverableError(err) {
					console.error(err);
				},
			},
		);
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

function createDevtoolsStream() {
	let previousChunkTime: number | null = null;
	const transformStream = new TransformStream({
		transform(chunk, controller) {
			const currentTime = Date.now();

			if (previousChunkTime !== null) {
				const timeDifference = currentTime - previousChunkTime;
				console.log(`Time difference from previous chunk: ${timeDifference}ms`);
			} else {
				console.log("Received the first chunk");
			}

			console.log(`Chunk: ${decoder.decode(chunk)}`);
			previousChunkTime = currentTime;

			// Pass the chunk along the stream without modification
			controller.enqueue(chunk);
		},
	});
	return transformStream;
}
