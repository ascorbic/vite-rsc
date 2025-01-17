"use client";

import { createBrowserHistory, createMemoryHistory, createPath } from "history";
import React, {
	startTransition,
	use,
	useEffect,
	useMemo,
	useReducer,
	useState,
} from "react";
import { RouterContext } from "./useRouter";
import { RedirectBoundary } from "./RedirectBoundary";
import {
	addMutationListener,
	createElementFromRSCFetch,
	mutate,
	refreshRSC,
	useRerender,
} from "../streams";

type RouterState = {
	url: string;
	cache: Map<string, React.Thenable<React.ReactElement>>;
};

type RouterAction = { type: "navigate"; url: string };

function reducer(state: RouterState, action: RouterAction) {
	switch (action.type) {
		case "navigate":
			if (!state.cache.has(action.url)) {
				state.cache.set(action.url, createElementFromRSCFetch(action.url));
			}
			return { ...state, url: action.url };
		default:
			return state;
	}
}

// Main Router component, should be rendered with the initial request during SSR
// and hydrated on the client. But because it's meant to be a nested router, after
// initial hydration, it should replace it's children using client side navigation, but
// fetching the contents of the new route from the server (RSC)
export default function Router({
	children,
	initialURL,
}: {
	children: React.ReactNode;
	initialURL: string;
}) {
	const [cache] = useState(() => new Map<string, Promise<JSX.Element>>());
	const initialState = useMemo(() => {
		cache.set(initialURL, children as any);
		return {
			url: initialURL,
			cache: cache,
		};
	}, [initialURL, cache, children]);

	const renrender = useRerender();

	const [state, dispatch] = useReducer(reducer, initialState);
	const router = useMemo(() => {
		const history =
			typeof window === "undefined"
				? createMemoryHistory()
				: createBrowserHistory();

		return {
			push(url: string, state: any) {
				history.push(url, state);
				startTransition(() => dispatch({ type: "navigate", url }));
			},
			replace(url: string, state: any) {
				history.replace(url, state);
				startTransition(() => dispatch({ type: "navigate", url }));
			},
			mutate: mutate,
			refresh: refreshRSC,
			history,
			cache,
		};
	}, [dispatch, cache]);

	useEffect(() => {
		return router.history.listen((update) => {
			if (update.action === "POP") {
				startTransition(() => {
					dispatch({ type: "navigate", url: createPath(update.location) });
				});
			}
		});
	}, [router]);

	useEffect(() => {
		return addMutationListener((val) => {
			startTransition(() => {
				console.log("rerendering");
				initialState.cache.set(initialState.url, val);
				renrender();
			});
		});
	}, [initialState.url, router, renrender]);

	const content = state.cache.get(state.url);

	return (
		<RouterContext.Provider value={{ url: state.url, ...router }}>
			<RedirectBoundary>
				<LayoutRouter childNode={content} />
			</RedirectBoundary>
		</RouterContext.Provider>
	);
}

function LayoutRouter({ childNode }: { childNode: any }) {
	const resolvedContext = childNode?.then
		? use(childNode)
		: childNode ?? (null as any);
	return resolvedContext;
}
