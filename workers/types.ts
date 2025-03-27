import type { User, Message, MessageType } from "../drizzle/schema";

// 在线人数消息
export interface OnlineCountMessage {
	type: "online_count";
	count: number;
}

// 初始化消息
export interface InitMessage {
	type: "init";
	user: User;
}

// 用户上线消息
export interface UserJoinMessage {
	type: "user_join";
	user: User;
}

// 用户下线消息
export interface UserLeaveMessage {
	type: "user_leave";
	user: User;
}

// 聊天消息
export interface ChatMessage {
	type: "message";
	message: Message;
	sender?: {
		id: string;
		name: string;
	};
}

// 历史消息
export interface HistoryMessagesMessage {
	type: "history_messages";
	messages: Message[];
}

// 所有可能的消息类型联合
export type WebSocketMessage =
	| OnlineCountMessage
	| InitMessage
	| ChatMessage
	| UserJoinMessage
	| UserLeaveMessage
	| HistoryMessagesMessage;

// 客户端发送到服务端的消息类型
export type ClientToServerMessage = {
	type: "message";
	content: string;
	messageType: keyof typeof MessageType;
	metadata?: {
		width?: number;
		height?: number;
		mimeType?: string;
		fileSize?: number;
		thumbnailUrl?: string;
	}; // 元数据，用于图片等特殊消息类型
};
