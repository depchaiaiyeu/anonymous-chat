import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
	User,
	Message as DbMessage,
	MessageType,
	MessageTypeKeys,
	MessageMetadata,
} from "../../drizzle/schema";

export interface ChatMessage extends DbMessage {
	isOwn: boolean;
	userName?: string;
}

// WebSocket 状态管理
interface WebSocketStore {
	connection: WebSocket | null;
	isConnecting: boolean;
	user: User | null;
	onlineCount: number;
	setUser: (user: User) => void;
	setOnlineCount: (count: number) => void;
	connect: () => void;
	disconnect: () => void;
	initUser: () => void;
	switchIdentity: () => void;
	changeName: (newName: string) => void;
}

// 消息状态管理
interface ChatStore {
	messages: ChatMessage[];
	addMessage: (content: string) => void;
	addServerMessage: (
		message: DbMessage,
		sender?: { id: string; name: string },
	) => void;
	addSystemMessage: (content: string) => void;
	handleUserJoin: (user: User) => void;
	handleUserLeave: (user: User) => void;
	loadHistoryMessages: (
		messages: (DbMessage & { sender?: { id: string; name: string } })[],
	) => void;
}

// 从 localStorage 获取用户信息
const getUserFromStorage = () => {
	try {
		const userStr = localStorage.getItem("user");
		return userStr ? JSON.parse(userStr) : null;
	} catch {
		return null;
	}
};

// 保存用户信息到 localStorage
const saveUserToStorage = (user: User) => {
	try {
		localStorage.setItem("user", JSON.stringify(user));
	} catch {
		// 忽略错误
	}
};

// 从 localStorage 移除用户信息
const removeUserFromStorage = () => {
	try {
		localStorage.removeItem("user");
	} catch {
		// 忽略错误
	}
};

function createWebSocket(userId?: string) {
	try {
		const wsUrl = new URL("/ws", window.location.href);
		wsUrl.protocol = wsUrl.protocol.replace("http", "ws");
		if (userId) {
			wsUrl.searchParams.set("userId", userId);
		}
		return new WebSocket(wsUrl.toString());
	} catch (error) {
		console.error("创建WebSocket连接失败:", error);
		return null;
	}
}

// WebSocket Store
export const useWebSocketStore = create<WebSocketStore>()(
	persist(
		(set, get) => {
			// 用于存储重连定时器
			let reconnectTimeout: number | null = null;
			let isInitialized = false;

			// 清理重连定时器
			const clearReconnectTimeout = () => {
				if (reconnectTimeout) {
					clearTimeout(reconnectTimeout);
					reconnectTimeout = null;
				}
			};

			// 设置重连
			const setupReconnect = () => {
				clearReconnectTimeout();
				reconnectTimeout = window.setTimeout(() => {
					reconnectTimeout = null;
					const store = get();
					if (!store.connection && isInitialized) {
						store.connect();
					}
				}, 3000); // 3秒后重连
			};

			return {
				connection: null,
				isConnecting: false,
				user: null,
				onlineCount: 0,

				connect: () => {
					try {
						const store = get();
						const chatStore = useChatStore.getState();
						if (store.connection || store.isConnecting || !isInitialized)
							return;

						set({ isConnecting: true });

						const ws = createWebSocket(store.user?.id);
						if (!ws) {
							set({ isConnecting: false });
							return;
						}

						ws.onmessage = (event) => {
							try {
								const data = JSON.parse(event.data);

								switch (data.type) {
									case "init":
										store.setUser(data.user);
										break;
									case "message":
										chatStore.addServerMessage(data.message, data.sender);
										break;
									case "online_count":
										store.setOnlineCount(data.count);
										break;
									case "user_join":
										chatStore.handleUserJoin(data.user);
										break;
									case "user_leave":
										chatStore.handleUserLeave(data.user);
										break;
									case "history_messages":
										chatStore.loadHistoryMessages(data.messages);
										break;
									default:
										console.warn("Unknown message type:", data.type);
								}
							} catch (error) {
								console.error("Failed to parse message:", error);
							}
						};

						ws.onopen = () => {
							console.log("WebSocket连接已打开");
							set({ connection: ws, isConnecting: false });
							clearReconnectTimeout();
						};

						ws.onclose = (event) => {
							console.log(
								"WebSocket连接已关闭，尝试重新连接...",
								event.code,
								event.reason,
							);
							set({ connection: null, isConnecting: false });

							// 如果是因为用户ID无效(状态码1008或收到400响应)，则清除用户ID并立即重连
							if (event.code === 1008 || event.code === 1011) {
								console.log("用户ID无效，清除并重新连接");
								removeUserFromStorage();
								set({ user: null });
								// 立即重连
								setTimeout(() => store.connect(), 100);
							} else {
								// 其他原因的关闭，正常延时重连
								setupReconnect();
							}
						};

						ws.onerror = (error) => {
							console.error("WebSocket错误:", error);
							// 不要立即关闭，让onclose处理
						};
					} catch (error) {
						console.error("连接WebSocket时出错:", error);
						set({ isConnecting: false });
						setupReconnect();
					}
				},

				disconnect: () => {
					const store = get();
					clearReconnectTimeout();
					if (store.connection) {
						store.connection.close();
						set({ connection: null });
					}
				},

				setUser: (user: User) => {
					set({ user });
					saveUserToStorage(user);
				},

				setOnlineCount: (count: number) => {
					set({ onlineCount: count });
				},

				initUser: () => {
					try {
						const user = getUserFromStorage();
						if (user) set({ user });
						isInitialized = true;
					} catch (error) {
						console.error("初始化用户数据时出错:", error);
						isInitialized = true;
					}
				},

				switchIdentity: () => {
					try {
						const store = get();
						store.disconnect();
						removeUserFromStorage();
						set({ user: null });
						// 强制页面重新加载以重新初始化连接
						window.location.reload();
					} catch (error) {
						console.error("切换身份时出错:", error);
					}
				},

				changeName: (newName: string) => {
					const store = get();
					if (store.user && store.connection) {
						const updatedUser = { ...store.user, name: newName };
						set({ user: updatedUser });
						saveUserToStorage(updatedUser);
						// 仅在本地更新用户名，服务端不需要实时同步
					}
				},
			};
		},
		{
			name: "chat-websocket-storage",
			partialize: (state) => ({ user: state.user }),
		},
	),
);

// 生成系统消息的ID
const generateSystemMessageId = () =>
	`system-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

// Chat Store
export const useChatStore = create<ChatStore>()((set) => ({
	messages: [],

	addMessage: (content: string) => {
		try {
			const wsStore = useWebSocketStore.getState();
			if (!wsStore.connection || !content.trim()) return;

			// 发送消息到服务器
			wsStore.connection.send(
				JSON.stringify({
					type: "message",
					content: content.trim(),
					messageType: "TEXT",
				}),
			);

			// 实际消息会通过服务器返回添加，不在客户端添加
		} catch (error) {
			console.error("发送消息时出错:", error);
		}
	},

	addServerMessage: (
		message: DbMessage,
		sender?: { id: string; name: string },
	) => {
		const wsStore = useWebSocketStore.getState();
		const isOwn = message.userId === wsStore.user?.id;
		// 优先使用sender中的用户名，其次使用自己的用户名（如果是自己的消息）
		const userName = sender?.name || (isOwn ? wsStore.user?.name : undefined);

		set((state) => ({
			messages: [
				...state.messages,
				{
					...message,
					isOwn,
					userName,
				} as ChatMessage,
			],
		}));
	},

	addSystemMessage: (content: string) => {
		set((state) => ({
			messages: [
				...state.messages,
				{
					id: generateSystemMessageId(),
					userId: "System",
					content,
					messageType: "TEXT",
					isOwn: false,
					createdAt: new Date(),
				} as ChatMessage,
			],
		}));
	},

	handleUserJoin: (user: User) => {
		const wsStore = useWebSocketStore.getState();
		// 不显示自己的加入消息
		if (user.id === wsStore.user?.id) return;

		set((state) => ({
			messages: [
				...state.messages,
				{
					id: generateSystemMessageId(),
					userId: "System",
					content: `${user.name || "匿名用户"} 加入了聊天室`,
					messageType: "TEXT",
					isOwn: false,
					createdAt: new Date(),
				} as ChatMessage,
			],
		}));
	},

	handleUserLeave: (user: User) => {
		const wsStore = useWebSocketStore.getState();
		// 不显示自己的离开消息
		if (user.id === wsStore.user?.id) return;

		set((state) => ({
			messages: [
				...state.messages,
				{
					id: generateSystemMessageId(),
					userId: "System",
					content: `${user.name || "匿名用户"} 离开了聊天室`,
					messageType: "TEXT",
					isOwn: false,
					createdAt: new Date(),
				} as ChatMessage,
			],
		}));
	},

	loadHistoryMessages: (
		messages: (DbMessage & { sender?: { id: string; name: string } })[],
	) => {
		const wsStore = useWebSocketStore.getState();
		const userId = wsStore.user?.id;

		// 转换消息格式并添加isOwn和userName属性
		const formattedMessages = messages.map((message) => {
			const isOwn = message.userId === userId;
			// 优先使用sender中的用户名，其次使用自己的用户名（如果是自己的消息）
			const userName =
				message.sender?.name || (isOwn ? wsStore.user?.name : undefined);

			return {
				...message,
				isOwn,
				userName,
			} as ChatMessage;
		});

		// 添加到消息列表中
		set((state) => ({
			messages: [...formattedMessages, ...state.messages],
		}));
	},
}));
