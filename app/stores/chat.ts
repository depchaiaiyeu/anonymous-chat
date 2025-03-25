import { create } from "zustand";

interface Message {
	content: string;
	isOwn: boolean;
	userId: string;
}

interface ChatStore {
	connection: WebSocket | null;
	messages: Message[];
	userId: string;
	onlineCount: number;
	addMessage: (message: Message | string) => void;
	setConnection: (connection: WebSocket | null) => void;
	setUserId: (id: string) => void;
	setOnlineCount: (count: number) => void;
	initUser: () => { userId: string | null };
	switchIdentity: () => void;
}

// 从 localStorage 获取用户信息
const getUserFromStorage = () => {
	try {
		const id = localStorage.getItem("userId");
		return { id };
	} catch {
		return { id: null };
	}
};

// 保存用户信息到 localStorage
const saveUserToStorage = (id: string) => {
	try {
		localStorage.setItem("userId", id);
	} catch {
		// 忽略错误
	}
};

export const useChatStore = create<ChatStore>((set) => ({
	connection: null,
	messages: [],
	userId: "Anonymous",
	onlineCount: 0,
	addMessage: (message) => {
		set((state) => ({
			messages: [
				...state.messages,
				typeof message === "string"
					? {
							content: message,
							isOwn: true,
							userId: state.userId,
						}
					: message,
			],
		}));
	},
	setConnection: (connection: WebSocket | null) => {
		set({ connection });
	},
	setUserId: (id: string) => {
		set({ userId: id });
		saveUserToStorage(id);
	},
	setOnlineCount: (count: number) => {
		set({ onlineCount: count });
	},
	initUser: () => {
		const { id } = getUserFromStorage();
		if (id) set({ userId: id });
		return { userId: id };
	},
	switchIdentity: () => {
		const connection = useChatStore.getState().connection;
		if (connection) {
			connection.close();
		}
		localStorage.removeItem("userId");
		set({ userId: "Anonymous" });
		// 强制页面重新加载以重新初始化连接
		window.location.reload();
	},
}));
