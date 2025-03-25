import type { Route } from "./+types/ws";

export async function loader({ request, context }: Route.LoaderArgs) {
	const env = context.cloudflare.env;
	const chatServer = env.CHAT_SERVER.idFromName("chat-server");
	const stub = env.CHAT_SERVER.get(chatServer);
	return stub.fetch(request);
}
