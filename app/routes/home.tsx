import { useChatStore } from "~/stores/chat";
import { useRef, useState, useEffect } from "react";

function createWebSocket(userId: string | null) {
	const wsUrl = new URL("/ws", window.location.href);
	wsUrl.protocol = wsUrl.protocol.replace("http", "ws");
	if (userId) {
		wsUrl.searchParams.set("userId", userId);
	}
	return new WebSocket(wsUrl.toString());
}

export async function clientLoader() {
	const store = useChatStore.getState();
	const { addMessage, setConnection, setUserId, setOnlineCount, initUser } =
		store;

	// 初始化用户信息
	const { userId } = initUser();
	let reconnectTimeout: number | null = null;

	function setupWebSocket() {
		// 如果已经有重连计时器，先清除它
		if (reconnectTimeout) {
			clearTimeout(reconnectTimeout);
			reconnectTimeout = null;
		}

		const webSocket = createWebSocket(userId);

		webSocket.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data);
				if (data.type === "init") {
					setUserId(data.userId);
				} else if (data.type === "message") {
					addMessage({
						content: data.content,
						isOwn: false,
						userId: data.userId,
					});
				} else if (data.type === "online_count") {
					setOnlineCount(data.count);
				}
			} catch (error) {
				console.error("Failed to parse message:", error);
			}
		};

		webSocket.onopen = () => {
			console.log("WebSocket is open");
			setConnection(webSocket);
			// 连接成功后清除重连计时器
			if (reconnectTimeout) {
				clearTimeout(reconnectTimeout);
				reconnectTimeout = null;
			}
		};

		webSocket.onclose = () => {
			console.log("WebSocket is closed, trying to reconnect...");
			setConnection(null);
			// 设置重连计时器
			reconnectTimeout = window.setTimeout(() => {
				reconnectTimeout = null;
				setupWebSocket();
			}, 1000);
		};

		webSocket.onerror = (error) => {
			console.error("WebSocket error:", error);
			webSocket.close();
		};

		return webSocket;
	}

	// 初始化连接
	const initialWebSocket = setupWebSocket();

	// 清理函数
	return () => {
		if (reconnectTimeout) {
			clearTimeout(reconnectTimeout);
		}
		initialWebSocket.close();
	};
}

clientLoader.hydrate = true as const;

export default function Home() {
	const {
		connection,
		messages,
		addMessage,
		userId,
		onlineCount,
		switchIdentity,
	} = useChatStore();
	const [inputMessage, setInputMessage] = useState("");
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const [isConnected, setIsConnected] = useState(false);

	useEffect(() => {
		setIsConnected(!!connection);
	}, [connection]);

	const scrollToBottom = () => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	};

	useEffect(() => {
		scrollToBottom();
	}, [messages]);

	function sendMessage(message: string) {
		if (!message.trim() || !connection) return;
		addMessage(`${message}`);
		connection.send(message);
		setInputMessage("");
	}

	function handleKeyPress(e: React.KeyboardEvent) {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			sendMessage(inputMessage);
		}
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
				<div className="flex items-center justify-between gap-2 mt-2 max-w-4xl mx-auto">
					<div className="flex items-center gap-2">
						<div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-medium shadow-sm">
							{userId[0]}
						</div>
						<p className="text-sm text-gray-500">
							你是 <span className="font-medium text-gray-700">{userId}</span>
						</p>
					</div>
					<button
						onClick={switchIdentity}
						className="text-sm px-3 py-1.5 rounded-lg bg-gray-50 text-gray-600 hover:bg-gray-100 transition-colors"
					>
						切换身份
					</button>
				</div>
			</div>

			{/* Messages Container */}
			<div className="flex-1 overflow-y-auto p-4 space-y-4">
				{messages.map((message, index) => {
					const isSystem = message.userId === "System";
					if (isSystem) {
						return (
							<div key={index} className="flex justify-center">
								<div className="bg-gray-50 text-gray-500 text-sm px-4 py-1.5 rounded-full border border-gray-100/50 shadow-sm backdrop-blur-sm">
									{message.content}
								</div>
							</div>
						);
					}
					return (
						<div
							key={index}
							className={`flex items-start gap-3 ${
								message.isOwn ? "flex-row-reverse" : "flex-row"
							}`}
						>
							<div className="flex flex-col items-center gap-1">
								<div
									className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium shadow-sm ${
										message.isOwn
											? "bg-blue-500 text-white"
											: "bg-gray-100 text-gray-600"
									}`}
								>
									{message.userId[0]}
								</div>
								<span className="text-[11px] text-gray-400 font-medium">
									{message.isOwn ? "你" : message.userId}
								</span>
							</div>
							<div
								className={`max-w-[70%] break-words px-4 py-2.5 rounded-2xl shadow-sm ${
									message.isOwn
										? "bg-blue-500 text-white rounded-br-md"
										: "bg-white text-gray-700 rounded-bl-md"
								}`}
							>
								{message.content}
							</div>
						</div>
					);
				})}
				<div ref={messagesEndRef} />
			</div>

			{/* Input Area */}
			<div className="bg-white/90 backdrop-blur-lg shadow-[0_-1px_3px_rgba(0,0,0,0.1)] sticky bottom-0">
				<div className="max-w-4xl mx-auto p-4">
					<div className="relative flex items-end gap-2 bg-white rounded-2xl p-2 shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-gray-100">
						<textarea
							value={inputMessage}
							onChange={(e) => setInputMessage(e.target.value)}
							onKeyPress={handleKeyPress}
							placeholder={isConnected ? "输入消息..." : "正在连接..."}
							disabled={!isConnected}
							className="flex-1 resize-none bg-transparent px-3 py-2 max-h-32 focus:outline-none disabled:text-gray-400 placeholder:text-gray-400 text-gray-600"
							rows={1}
						/>
						<button
							onClick={() => sendMessage(inputMessage)}
							disabled={!inputMessage.trim() || !isConnected}
							className="flex-shrink-0 p-2.5 rounded-xl bg-blue-500 text-white hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-500 shadow-sm"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 24 24"
								fill="currentColor"
								className="w-5 h-5"
							>
								<path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
							</svg>
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
