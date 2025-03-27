import { DurableObject } from "cloudflare:workers";
import {
	drizzle,
	type DrizzleSqliteDODatabase,
} from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import * as schema from "../drizzle/schema";
import migrations from "../drizzle/migrations";
import type {
	ClientToServerMessage,
	InitMessage,
	OnlineCountMessage,
	UserJoinMessage,
	UserLeaveMessage,
	WebSocketMessage,
	HistoryMessagesMessage,
} from "./types";

export class ChatServer extends DurableObject {
	private db: DrizzleSqliteDODatabase<typeof schema>;

	constructor(state: DurableObjectState, env: Env) {
		super(state, env);
		this.db = drizzle(state.storage, {
			logger: false,
			casing: "snake_case",
			schema: schema,
		});
		state.blockConcurrencyWhile(async () => {
			migrate(this.db, migrations);
		});
	}

	private broadcastUserJoinLeave(
		user: schema.User,
		type: "user_join" | "user_leave",
	) {
		const message: UserJoinMessage | UserLeaveMessage = {
			type,
			user,
		};
		this.broadcastMessage(message);
	}

	private broadcastOnlineCount() {
		const count = this.ctx.getWebSockets().length;
		const message: OnlineCountMessage = {
			type: "online_count",
			count,
		};
		this.broadcastMessage(message);
	}

	private broadcastMessage(message: WebSocketMessage) {
		for (const client of this.ctx.getWebSockets()) {
			client.send(JSON.stringify(message));
		}
	}

	// 获取并发送历史消息
	private async sendHistoryMessages(ws: WebSocket) {
		try {
			// 获取最近的50条消息
			const messages = await this.db.query.messages.findMany({
				orderBy: (messages, { desc }) => [desc(messages.createdAt)],
				limit: 50,
			});

			if (messages.length > 0) {
				// 获取所有消息发送者的用户ID
				const userIds = [...new Set(messages.map((msg) => msg.userId))];

				// 获取所有发送者信息
				const users = await this.db.query.users.findMany({
					where: (users, { inArray }) => inArray(users.id, userIds),
				});

				// 创建用户ID到用户名的映射
				const userMap = new Map();
				for (const user of users) {
					userMap.set(user.id, user.name);
				}

				// 为每条消息添加发送者信息
				const messagesWithSenders = messages.map((msg) => ({
					...msg,
					sender: {
						id: msg.userId,
						name: userMap.get(msg.userId) || "未知用户",
					},
				}));

				// 按照时间顺序发送消息
				const historyMessage: HistoryMessagesMessage = {
					type: "history_messages",
					messages: messagesWithSenders.reverse(),
				};
				ws.send(JSON.stringify(historyMessage));
			}
		} catch (error) {
			console.error("获取历史消息失败:", error);
		}
	}

	async fetch(request: Request) {
		const userId = new URL(request.url).searchParams.get("userId");
		let user: schema.User | null | undefined = null;
		if (!userId) {
			[user] = await this.db.insert(schema.users).values({}).returning();
		} else {
			user = await this.db.query.users.findFirst({
				where(fields, operators) {
					return operators.eq(fields.id, userId);
				},
			});
		}
		if (!user) {
			return new Response(null, {
				status: 400,
			});
		}
		const webSocketPair = new WebSocketPair();
		const [client, server] = Object.values(webSocketPair);
		this.ctx.acceptWebSocket(server);
		const userInitMessage: InitMessage = {
			type: "init",
			user,
		};
		server.serializeAttachment({
			userId: user.id,
		});
		server.send(JSON.stringify(userInitMessage));

		// 获取历史消息并发送
		await this.sendHistoryMessages(server);

		this.broadcastOnlineCount();
		this.broadcastUserJoinLeave(user, "user_join");
		return new Response(null, {
			status: 101,
			webSocket: client,
		});
	}

	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
		const attachment = ws.deserializeAttachment();
		if (!attachment) {
			return;
		}
		const { userId } = attachment as { userId: string };
		if (typeof message !== "string") {
			return;
		}
		// 解析客户端消息
		const clientMessage: ClientToServerMessage = JSON.parse(message);

		// 获取发送者用户信息
		const sender = await this.db.query.users.findFirst({
			where(fields, operators) {
				return operators.eq(fields.id, userId);
			},
		});

		if (!sender) {
			return;
		}

		// 处理消息内容
		let metadata = undefined;

		// 如果是图片消息，包含图片元数据
		if (clientMessage.messageType === "IMAGE" && clientMessage.metadata) {
			// 确保元数据符合ImageMetadata类型的要求
			const imageMetadata: schema.ImageMetadata = {
				width: Number(clientMessage.metadata.width || 0),
				height: Number(clientMessage.metadata.height || 0),
				mimeType: String(clientMessage.metadata.mimeType || "image/webp"),
				fileSize: Number(clientMessage.metadata.fileSize || 0),
			};

			// 可选的缩略图URL
			if (clientMessage.metadata.thumbnailUrl) {
				imageMetadata.thumbnailUrl = String(
					clientMessage.metadata.thumbnailUrl,
				);
			}

			metadata = imageMetadata;
		}

		const [msg] = await this.db
			.insert(schema.messages)
			.values({
				userId,
				messageType: clientMessage.messageType,
				content: clientMessage.content,
				metadata: metadata,
			})
			.returning();

		// 发送带有用户名的消息
		this.broadcastMessage({
			type: "message",
			message: msg,
			sender: {
				id: sender.id,
				name: sender.name,
			},
		});
	}

	async webSocketClose(
		ws: WebSocket,
		code: number,
		reason: string,
		wasClean: boolean,
	) {
		const { userId } = ws.deserializeAttachment() as { userId: string };
		if (!userId) {
			return;
		}
		const user = await this.db.query.users.findFirst({
			where(fields, operators) {
				return operators.eq(fields.id, userId);
			},
		});
		if (!user) {
			return;
		}
		this.broadcastOnlineCount();
		this.broadcastUserJoinLeave(user, "user_leave");
	}
}
