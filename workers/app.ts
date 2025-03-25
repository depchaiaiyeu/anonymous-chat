import { createRequestHandler } from "react-router";
export { ChatServer } from "./ws";

declare global {
	interface CloudflareEnvironment extends Env {}
}

declare module "react-router" {
	export interface AppLoadContext {
		cloudflare: {
			env: CloudflareEnvironment;
			ctx: ExecutionContext;
		};
	}
}

const requestHandler = createRequestHandler(
	() => import("virtual:react-router/server-build"),
	import.meta.env.MODE,
);

export default {
	async fetch(request, env, ctx) {
		return requestHandler(request, {
			cloudflare: { env, ctx },
		});
	},
} satisfies ExportedHandler<CloudflareEnvironment>;
