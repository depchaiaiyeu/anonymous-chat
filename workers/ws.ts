import { DurableObject } from "cloudflare:workers";

interface User {
	id: string;
	name: string;
}

export class ChatServer extends DurableObject {
	private users: Map<WebSocket, User>;

	constructor(state: DurableObjectState, env: Env) {
		super(state, env);
		this.users = new Map();
	}

	private generateUUID(): string {
		return crypto.randomUUID();
	}

	private getRandomName(): string {
		const adjectives = [
			"快乐",
			"聪明",
			"勇敢",
			"温柔",
			"睿智",
			"幸运",
			"善良",
			"酷酷",
			"平静",
			"明亮",
			"机智",
			"敏捷",
			"高贵",
			"甜美",
			"欢乐",
			"愉快",
			"骄傲",
			"热情",
			"机灵",
			"阳光",
			"活泼",
			"调皮",
			"友好",
			"安静",
			"开心",
			"优雅",
			"诚实",
			"可爱",
			"迷人",
			"大胆",
			"活力",
			"有趣",
			"谦逊",
			"神奇",
			"强大",
			"耐心",
			"华丽",
			"闪亮",
			"俏皮",
			"可爱",
		];
		const animals = [
			"猫咪",
			"狗狗",
			"狐狸",
			"熊熊",
			"猫头鹰",
			"狼",
			"狮子",
			"老虎",
			"熊猫",
			"兔子",
			"小鹿",
			"鸭子",
			"小鸟",
			"鱼儿",
			"海豹",
			"海豚",
			"企鹅",
			"考拉",
			"袋鼠",
			"大象",
			"长颈鹿",
			"猴子",
			"斑马",
			"刺猬",
			"松鼠",
			"仓鼠",
			"浣熊",
			"蝴蝶",
			"龙",
			"独角兽",
			"鲸鱼",
			"水獭",
			"小马",
			"羊驼",
			"海狸",
			"猎豹",
			"老鹰",
			"隼",
			"羚羊",
			"河马",
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

	private broadcastUserJoinLeave(user: User, isJoining: boolean) {
		const message = isJoining
			? `${user.name} 加入了聊天室`
			: `${user.name} 离开了聊天室`;
		for (const client of this.ctx.getWebSockets()) {
			client.send(
				JSON.stringify({
					type: "message",
					content: message,
					userId: "System",
					userName: "系统消息",
				}),
			);
		}
	}

	private broadcastNameChange(
		userId: string,
		oldName: string,
		newName: string,
	) {
		const message = `${oldName} 改名为 ${newName}`;
		for (const client of this.ctx.getWebSockets()) {
			client.send(
				JSON.stringify({
					type: "message",
					content: message,
					userId: "System",
					userName: "系统消息",
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
		const existingName = url.searchParams.get("name");

		// 使用现有信息或生成新的
		const user: User = {
			id: existingUserId || this.generateUUID(),
			name: existingName || this.getRandomName(),
		};
		this.users.set(server, user);

		this.ctx.acceptWebSocket(server);

		// 发送用户的信息
		server.send(
			JSON.stringify({
				type: "init",
				user,
			}),
		);

		// 广播在线人数和加入消息
		setTimeout(() => {
			this.broadcastOnlineCount();
			this.broadcastUserJoinLeave(user, true);
		}, 100);

		return new Response(null, {
			status: 101,
			webSocket: client,
		});
	}

	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
		const messageStr = message.toString();
		const user = this.users.get(ws);

		if (!user) return;

		try {
			const data = JSON.parse(messageStr);

			// 处理改名请求
			if (data.type === "name_change") {
				const oldName = user.name;
				user.name = data.newName;
				this.broadcastNameChange(user.id, oldName, user.name);
				return;
			}

			// 处理普通消息
			if (data.type === "message" && typeof data.content === "string") {
				for (const client of this.ctx.getWebSockets()) {
					if (client !== ws) {
						client.send(
							JSON.stringify({
								type: "message",
								content: data.content,
								userId: user.id,
								userName: user.name,
							}),
						);
					}
				}
			}
		} catch (e) {
			// 如果不是有效的 JSON，作为普通文本消息处理
			console.error("Failed to parse message:", e);
			for (const client of this.ctx.getWebSockets()) {
				if (client !== ws) {
					client.send(
						JSON.stringify({
							type: "message",
							content: messageStr,
							userId: user.id,
							userName: user.name,
						}),
					);
				}
			}
		}
	}

	async webSocketClose(
		ws: WebSocket,
		code: number,
		reason: string,
		wasClean: boolean,
	) {
		const user = this.users.get(ws);
		this.users.delete(ws);

		// 广播用户离开消息和更新在线人数
		if (user) {
			setTimeout(() => {
				this.broadcastUserJoinLeave(user, false);
				this.broadcastOnlineCount();
			}, 100);
		}
	}
}
