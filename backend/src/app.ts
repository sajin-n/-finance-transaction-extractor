import { Hono } from "hono";
import { authRoutes } from "./routes/auth";
import { txRoutes } from "./routes/transactions";

export const app = new Hono();

app.route("/api/auth", authRoutes);
app.route("/api/transactions", txRoutes);
