import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
	index("routes/home.tsx"),
	route("/ws", "routes/ws.ts"),
	route("/api/image", "routes/api/image.ts"),
	route("/api/images/:key", "routes/api/get-image.ts"),
] satisfies RouteConfig;
