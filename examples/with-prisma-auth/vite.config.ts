import { defineConfig } from "vite";
import react from "vite-react-server";

export default defineConfig({
	plugins: [
		react({
			serverEntry: "./app/entry-server.ts",
		}),
	],
});
