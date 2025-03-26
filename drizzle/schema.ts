import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { getRandomName } from "./utils";

export const users = sqliteTable("users", {
	id: text()
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	name: text()
		.notNull()
		.$defaultFn(() => getRandomName()),
	createdAt: integer({ mode: "timestamp_ms" })
		.notNull()
		.$defaultFn(() => new Date()),
});

export type User = typeof users.$inferSelect;

export const messages = sqliteTable("messages", {
	id: text()
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	userId: text()
		.notNull()
		.references(() => users.id),
	messageType: text().notNull(),
	content: text().notNull(),
	metadata: text({ mode: "json" }).$type<MessageMetadata[MessageTypeValues]>(),
	createdAt: integer({ mode: "timestamp_ms" })
		.notNull()
		.$defaultFn(() => new Date()),
});

export type Message = typeof messages.$inferSelect;

export const MessageType = {
	TEXT: "text",
	IMAGE: "image",
	AUDIO: "audio",
} as const;

export type MessageTypeKeys = keyof typeof MessageType;
export type MessageTypeValues = (typeof MessageType)[MessageTypeKeys];

export type TextMetadata = null;

export interface ImageMetadata {
	width: number;
	height: number;
	thumbnailUrl?: string;
	mimeType: string;
	fileSize: number;
}

export interface AudioMetadata {
	duration: number;
	mimeType: string;
	fileSize: number;
}

export type MessageMetadata = {
	[MessageType.TEXT]: TextMetadata;
	[MessageType.IMAGE]: ImageMetadata;
	[MessageType.AUDIO]: AudioMetadata;
};
