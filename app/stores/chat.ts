import { create } from "zustand";
import { persist } from "zustand/middleware";

interface Message {
	content: string;
	isOwn: boolean;
	userId: string;
	userName?: string;
}

interface User {
	id: string;
	name: string;
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
	messages: Message[];
	addMessage: (message: Message | string) => void;
	getCurrentUserId: () => string;
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

function createWebSocket(user: User | null) {
	const wsUrl = new URL("/ws", window.location.href);
	wsUrl.protocol = wsUrl.protocol.replace("http", "ws");
	if (user) {
		wsUrl.searchParams.set("userId", user.id);
		wsUrl.searchParams.set("name", user.name);
	}
	return new WebSocket(wsUrl.toString());
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
				}, 1000);
			};

			return {
				connection: null,
				isConnecting: false,
				user: null,
				onlineCount: 0,

				connect: () => {
					const store = get();
					const chatStore = useChatStore.getState();
					if (store.connection || store.isConnecting || !isInitialized) return;

					set({ isConnecting: true });
					const ws = createWebSocket(store.user);

					ws.onmessage = (event) => {
						try {
							const data = JSON.parse(event.data);
							if (data.type === "init") {
								store.setUser(data.user);
							} else if (data.type === "message") {
								chatStore.addMessage({
									content: data.content,
									isOwn: false,
									userId: data.userId,
									userName: data.userName,
								});
							} else if (data.type === "online_count") {
								store.setOnlineCount(data.count);
							}
						} catch (error) {
							console.error("Failed to parse message:", error);
						}
					};

					ws.onopen = () => {
						console.log("WebSocket is open");
						set({ connection: ws, isConnecting: false });
						clearReconnectTimeout();
					};

					ws.onclose = () => {
						console.log("WebSocket is closed, trying to reconnect...");
						set({ connection: null, isConnecting: false });
						setupReconnect();
					};

					ws.onerror = (error) => {
						console.error("WebSocket error:", error);
						ws.close();
					};
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
					const user = getUserFromStorage();
					if (user) set({ user });
					isInitialized = true;
				},

				switchIdentity: () => {
					const store = get();
					store.disconnect();
					localStorage.removeItem("user");
					set({ user: null });
					// 强制页面重新加载以重新初始化连接
					window.location.reload();
				},

				changeName: (newName: string) => {
					const store = get();
					if (store.user) {
						const updatedUser = { ...store.user, name: newName };
						set({ user: updatedUser });
						saveUserToStorage(updatedUser);
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

// Chat Store
export const useChatStore = create<ChatStore>()((set, get) => ({
	messages: [],

	addMessage: (message) => {
		const wsStore = useWebSocketStore.getState();
		set((state) => ({
			messages: [
				...state.messages,
				typeof message === "string"
					? {
							content: message,
							isOwn: true,
							userId: wsStore.user?.id || "",
							userName: wsStore.user?.name,
						}
					: message,
			],
		}));
	},

	getCurrentUserId: () => {
		return useWebSocketStore.getState().user?.id || "";
	},
}));
