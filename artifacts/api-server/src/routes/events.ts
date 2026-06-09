import { Router, type IRouter } from "express";
import { sseBroker, type SSEEvent } from "../lib/sse-broker";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/events", requireAuth, (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  res.write("event: connected\ndata: {}\n\n");

  const heartbeat = setInterval(() => {
    res.write(":heartbeat\n\n");
  }, 25000);

  const unsubscribe = sseBroker.subscribe((event: SSEEvent) => {
    const payload = JSON.stringify({ type: event.type, ...(event.data ?? {}) });
    res.write(`event: ${event.type}\ndata: ${payload}\n\n`);
  });

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

export default router;
