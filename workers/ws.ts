import { DurableObject } from "cloudflare:workers";

export class ChatServer extends DurableObject {
	private userIds: Map<WebSocket, string>;

	constructor(state: DurableObjectState, env: Env) {
		super(state, env);
		this.userIds = new Map();
	}

	private getRandomUserId(): string {
		const adjectives = [
			"Happy",
			"Clever",
			"Swift",
			"Brave",
			"Gentle",
			"Wise",
			"Lucky",
			"Kind",
			"Cool",
			"Calm",
			"Bright",
			"Smart",
			"Quick",
			"Noble",
			"Sweet",
			"Jolly",
			"Merry",
			"Proud",
			"Eager",
			"Witty",
			"Sunny",
			"Lively",
			"Playful",
			"Friendly",
			"Peaceful",
			"Cheerful",
			"Graceful",
			"Honest",
			"Fancy",
			"Charming",
			"Daring",
			"Energetic",
			"Funny",
			"Humble",
			"Magical",
			"Mighty",
			"Patient",
			"Royal",
			"Shiny",
			"Silly",
		];
		const animals = [
			"Cat",
			"Dog",
			"Fox",
			"Bear",
			"Owl",
			"Wolf",
			"Lion",
			"Tiger",
			"Panda",
			"Rabbit",
			"Deer",
			"Duck",
			"Bird",
			"Fish",
			"Seal",
			"Dolphin",
			"Penguin",
			"Koala",
			"Kangaroo",
			"Elephant",
			"Giraffe",
			"Monkey",
			"Zebra",
			"Hedgehog",
			"Squirrel",
			"Hamster",
			"Raccoon",
			"Butterfly",
			"Dragon",
			"Unicorn",
			"Whale",
			"Otter",
			"Pony",
			"Alpaca",
			"Beaver",
			"Cheetah",
			"Eagle",
			"Falcon",
			"Gazelle",
			"Hippo",
		];
		const randomAdjective =
			adjectives[Math.floor(Math.random() * adjectives.length)];
		const randomAnimal = animals[Math.floor(Math.random() * animals.length)];
		return `${randomAdjective}${randomAnimal}`;
	}

	private broadcastOnlineCount() {
		const count = this.ctx.getWebSockets().length;
		for (const client of this.ctx.getWebSockets()) {
			client.send(
				JSON.stringify({
					type: "online_count",
					count,
				}),
			);
		}
	}

	private broadcastUserJoinLeave(userId: string, isJoining: boolean) {
		const message = isJoining
			? `${userId} 加入了聊天室`
			: `${userId} 离开了聊天室`;
		for (const client of this.ctx.getWebSockets()) {
			client.send(
				JSON.stringify({
					type: "message",
					content: message,
					userId: "System",
				}),
			);
		}
	}

	async fetch(request: Request) {
		const webSocketPair = new WebSocketPair();
		const [client, server] = Object.values(webSocketPair);

		// 检查 URL 中是否包含现有用户信息
		const url = new URL(request.url);
		const existingUserId = url.searchParams.get("userId");

		// 使用现有信息或生成新的
		const userId = existingUserId || this.getRandomUserId();
		this.userIds.set(server, userId);

		this.ctx.acceptWebSocket(server);

		// 发送用户的 ID 信息
		server.send(
			JSON.stringify({
				type: "init",
				userId: userId,
			}),
		);

		// 广播在线人数和加入消息
		setTimeout(() => {
			this.broadcastOnlineCount();
			this.broadcastUserJoinLeave(userId, true);
		}, 100);

		return new Response(null, {
			status: 101,
			webSocket: client,
		});
	}

	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
		const messageStr = message.toString();
		const userId = this.userIds.get(ws) || "Anonymous";

		// 广播消息给所有连接的客户端，除了发送者
		for (const client of this.ctx.getWebSockets()) {
			if (client !== ws) {
				client.send(
					JSON.stringify({
						type: "message",
						content: messageStr,
						userId: userId,
					}),
				);
			}
		}
	}

	async webSocketClose(
		ws: WebSocket,
		code: number,
		reason: string,
		wasClean: boolean,
	) {
		const userId = this.userIds.get(ws);
		this.userIds.delete(ws);
		ws.close(code, "Durable Object is closing WebSocket");

		// 广播用户离开消息和更新在线人数
		if (userId) {
			setTimeout(() => {
				this.broadcastUserJoinLeave(userId, false);
				this.broadcastOnlineCount();
			}, 100);
		}
	}
}
