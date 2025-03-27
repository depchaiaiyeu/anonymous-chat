import type { Route } from "./+types/image";

export async function action({ request, context }: Route.ActionArgs) {
	const env = context.cloudflare.env;
	if (!request.body) {
		return Response.json({ error: "No body" }, { status: 400 });
	}

	try {
		// 解析FormData
		const formData = await request.formData();
		const imageFile = formData.get("image");

		if (!imageFile || !(imageFile instanceof File)) {
			return Response.json(
				{ error: "Missing or invalid image file" },
				{ status: 400 },
			);
		}

		// 获取文件内容
		const buffer = await imageFile.arrayBuffer();

		// 检查图片数据是否为空
		if (buffer.byteLength === 0) {
			return Response.json({ error: "Empty image data" }, { status: 400 });
		}

		// 生成唯一的图片文件名
		const key = `${crypto.randomUUID()}.webp`;

		// 直接存储原始图片
		await env.BUCKET.put(key, buffer, {
			httpMetadata: {
				contentType: imageFile.type || "image/jpeg",
			},
		});

		// 判断图片尺寸（如果无法获取，使用默认值）
		let width = 800;
		let height = 600;
		const fileSize = buffer.byteLength;

		try {
			// 尝试获取图片信息 - 创建一个新的请求以包含图片数据
			const imageStream = new Response(buffer).body;
			if (imageStream) {
				const info = await env.IMAGES.info(imageStream);
				if (info && "width" in info && "height" in info) {
					width = info.width;
					height = info.height;
				}
			}
		} catch (infoError) {
			console.warn("Could not get image info:", infoError);
		}

		// 返回图片元数据
		return Response.json({
			success: true,
			key,
			url: `/api/images/${key}`,
			metadata: {
				width,
				height,
				mimeType: imageFile.type || "image/jpeg",
				fileSize,
			},
		});
	} catch (error) {
		console.error("Error processing image:", error);
		return Response.json(
			{
				error: "Failed to process image",
			},
			{
				status: 500,
			},
		);
	}
}
