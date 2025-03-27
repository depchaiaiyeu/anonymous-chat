import type { Route } from "./+types/get-image";

export async function loader({ params, context }: Route.LoaderArgs) {
	const { key } = params;
	try {
		const env = context.cloudflare.env;
		const object = await env.BUCKET.get(key);

		if (!object) {
			return new Response("Image not found", { status: 404 });
		}

		// Create a response with the image data and appropriate headers
		const headers = new Headers();
		headers.set(
			"Content-Type",
			object.httpMetadata?.contentType || "image/webp",
		);
		headers.set("Cache-Control", "public, max-age=31536000"); // Cache for 1 year

		return new Response(object.body, {
			headers,
		});
	} catch (error) {
		console.error("Error fetching image:", error);
		return new Response("Error fetching image", { status: 500 });
	}
}
