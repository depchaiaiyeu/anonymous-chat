import { useChatStore, useWebSocketStore } from "~/stores/chat";
import { useRef, useState, useEffect, useCallback } from "react";
import type { ChatMessage } from "~/stores/chat";
import { MessageType } from "../../drizzle/schema";

export async function clientLoader() {
	try {
		// 从 store 获取 WebSocket 实例和状态
		const wsStore = useWebSocketStore.getState();

		// 1. 初始化用户信息
		wsStore.initUser();

		// 2. 建立 WebSocket 连接
		wsStore.connect();
	} catch (error) {
		console.error("初始化WebSocket时出错:", error);
	}

	return null;
}

clientLoader.hydrate = true as const;

// 标记为客户端专用的路由
export const handle = { hydrate: true };

export default function Home() {
	const { connection, user, onlineCount, switchIdentity, changeName } =
		useWebSocketStore();

	const { messages, addMessage } = useChatStore();

	const [inputMessage, setInputMessage] = useState("");
	const [isEditingName, setIsEditingName] = useState(false);
	const [newName, setNewName] = useState("");
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const nameInputRef = useRef<HTMLInputElement>(null);
	const [isConnected, setIsConnected] = useState(false);

	const scrollToBottom = useCallback(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, []);

	useEffect(() => {
		scrollToBottom();
	}, [scrollToBottom]);

	useEffect(() => {
		if (messages.length > 0) {
			scrollToBottom();
		}
	}, [messages.length, scrollToBottom]);

	useEffect(() => {
		setIsConnected(!!connection);
	}, [connection]);

	useEffect(() => {
		if (isEditingName && nameInputRef.current) {
			nameInputRef.current.focus();
		}
	}, [isEditingName]);

	function sendMessage(message: string) {
		if (!message.trim() || !connection) return;
		addMessage(message);
		setInputMessage("");
	}

	function handleKeyPress(e: React.KeyboardEvent) {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			sendMessage(inputMessage);
		}
	}

	function handleNameChange() {
		if (!newName.trim()) return;
		changeName(newName.trim());
		setIsEditingName(false);
		setNewName("");
	}

	function handleNameKeyPress(e: React.KeyboardEvent) {
		if (e.key === "Enter") {
			e.preventDefault();
			handleNameChange();
		} else if (e.key === "Escape") {
			setIsEditingName(false);
			setNewName("");
		}
	}

	// 渲染消息内容
	function renderMessageContent(message: ChatMessage) {
		// 正常消息类型处理
		switch (message.messageType) {
			case MessageType.TEXT:
				return <div className="break-words text-sm">{message.content}</div>;
			case MessageType.IMAGE:
				if (message.metadata) {
					const imageMetadata = message.metadata as {
						width: number;
						height: number;
						mimeType: string;
						fileSize: number;
						thumbnailUrl?: string;
					};
					return (
						<div>
							<img
								src={message.content}
								alt="图片"
								className="max-w-full rounded-lg max-h-80 object-contain"
								style={{
									width: imageMetadata.width > 300 ? 300 : imageMetadata.width,
									height: "auto",
								}}
							/>
						</div>
					);
				}
				return (
					<img
						src={message.content}
						alt="图片"
						className="max-w-full rounded-lg max-h-80 object-contain"
					/>
				);
			case MessageType.AUDIO:
				return (
					<div>
						<audio controls src={message.content} className="max-w-full">
							<track kind="captions" />
							你的浏览器不支持音频播放
						</audio>
					</div>
				);
			default:
				return <div className="break-words text-sm">{message.content}</div>;
		}
	}

	// 渲染消息
	function renderMessage(message: ChatMessage, index: number) {
		const isSystem = message.userId === "System";
		const messageId = message.id;

		if (isSystem) {
			return (
				<div key={messageId} className="flex justify-center">
					<div className="text-gray-500 text-sm">{message.content}</div>
				</div>
			);
		}

		// 获取用户名
		let userName = message.userName;
		if (!userName) {
			// 如果是自己的消息，使用当前用户名
			if (message.isOwn && user) {
				userName = user.name;
			} else {
				// 这里理想情况下应该从某种用户缓存中获取，但简化处理
				userName = `用户 ${message.userId.substring(0, 5)}`;
			}
		}

		return (
			<div
				key={messageId}
				className={`flex items-start ${
					message.isOwn ? "justify-end" : "justify-start"
				}`}
			>
				<div className="flex items-start gap-2 max-w-[85%]">
					{!message.isOwn && (
						<>
							<div className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-400 flex items-center justify-center text-sm font-medium text-white">
								{userName[0]}
							</div>
							<div className="flex flex-col gap-1 min-w-0">
								<span className="text-xs text-gray-500">{userName}</span>
								<div className="px-4 py-2 rounded-2xl bg-gray-100 text-gray-700">
									{renderMessageContent(message)}
								</div>
							</div>
						</>
					)}
					{message.isOwn && (
						<>
							<div className="flex flex-col gap-1 items-end min-w-0">
								<span className="text-xs text-blue-500">{userName}</span>
								<div className="px-4 py-2 rounded-2xl bg-blue-500 text-white">
									{renderMessageContent(message)}
								</div>
							</div>
							<div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-sm font-medium text-white">
								{userName[0]}
							</div>
						</>
					)}
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-screen bg-gray-100">
			{/* Header */}
			<div className="bg-white shadow-sm p-4 sticky top-0 z-10 backdrop-blur-lg bg-white/80">
				<div className="flex justify-between items-center max-w-4xl mx-auto">
					<h1 className="text-xl font-semibold text-gray-800">匿名聊天室</h1>
					<div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-full">
						<div
							className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500 animate-pulse" : "bg-red-500"}`}
						/>
						<div className="text-sm text-gray-600 font-medium">
							{isConnected ? `在线: ${onlineCount} 人` : "连接中..."}
						</div>
					</div>
				</div>
				{!isConnected && (
					<div className="mt-2 text-center text-sm text-yellow-600 bg-yellow-50 rounded-lg p-2 max-w-4xl mx-auto">
						<span>提示: 一直连接不上? 请尝试</span>
						<button
							type="button"
							onClick={switchIdentity}
							className="font-medium text-blue-600 hover:text-blue-800 underline ml-1"
						>
							切换身份
						</button>
					</div>
				)}
				<div className="flex items-center justify-between gap-2 mt-2 max-w-4xl mx-auto">
					<div className="flex items-center gap-2">
						<div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-medium shadow-sm">
							{user?.name?.[0] || "?"}
						</div>
						<div className="flex items-center gap-2">
							<p className="text-sm text-gray-500">
								你是{" "}
								{isEditingName ? (
									<input
										ref={nameInputRef}
										type="text"
										value={newName}
										onChange={(e) => setNewName(e.target.value)}
										onKeyDown={handleNameKeyPress}
										onBlur={handleNameChange}
										placeholder={user?.name}
										className="px-2 py-0.5 rounded border border-gray-200 focus:outline-none focus:border-blue-500 text-sm"
									/>
								) : (
									<button
										type="button"
										onClick={() => {
											setIsEditingName(true);
											setNewName(user?.name || "");
										}}
										className="font-medium text-gray-700 hover:text-blue-500 transition-colors"
									>
										{user?.name}
									</button>
								)}
							</p>
						</div>
					</div>
					<button
						type="button"
						onClick={switchIdentity}
						className="text-sm px-3 py-1.5 rounded-lg bg-gray-50 text-gray-600 hover:bg-gray-100 transition-colors"
					>
						切换身份
					</button>
				</div>
			</div>

			{/* Messages Container */}
			<div className="flex-1 overflow-y-auto p-4 space-y-3">
				{messages.map(renderMessage)}
				<div ref={messagesEndRef} />
			</div>

			{/* Input Area */}
			<div className="bg-white/90 backdrop-blur-lg shadow-[0_-1px_3px_rgba(0,0,0,0.1)] sticky bottom-0">
				<div className="max-w-4xl mx-auto p-4">
					<div className="relative flex items-end gap-2 bg-white rounded-2xl p-2 shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-gray-100">
						<textarea
							value={inputMessage}
							onChange={(e) => setInputMessage(e.target.value)}
							onKeyDown={handleKeyPress}
							placeholder={isConnected ? "输入消息..." : "正在连接..."}
							disabled={!isConnected}
							className="flex-1 resize-none bg-transparent px-3 py-2 max-h-32 focus:outline-none disabled:text-gray-400 placeholder:text-gray-400 text-gray-600"
							rows={1}
						/>
						<button
							type="submit"
							onClick={() => sendMessage(inputMessage)}
							disabled={!inputMessage.trim() || !isConnected}
							className="flex-shrink-0 p-2.5 rounded-xl bg-blue-500 text-white hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-500 shadow-sm"
							aria-label="发送消息"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 24 24"
								fill="currentColor"
								className="w-5 h-5"
								role="img"
							>
								<title>发送</title>
								<path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
							</svg>
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
