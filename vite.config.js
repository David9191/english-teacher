import fs from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// 학습 콘텐츠를 src/content/unit-XX.json 파일로 저장/삭제하는 개발 서버 API
function contentFilePlugin() {
  return {
    name: "content-file-api",
    configureServer(server) {
      const dir = path.resolve(process.cwd(), "src/content");
      server.middlewares.use("/api/content", async (req, res) => {
        res.setHeader("Content-Type", "application/json");
        const send = (code, obj) => {
          res.statusCode = code;
          res.end(JSON.stringify(obj));
        };
        try {
          const id = Number((req.url || "").replace(/^\/+/, "").split("?")[0]);
          if (!Number.isInteger(id) || id <= 0)
            return send(400, { error: { message: "잘못된 unit id" } });
          const file = path.join(
            dir,
            `unit-${String(id).padStart(2, "0")}.json`,
          );

          if (req.method === "DELETE") {
            if (fs.existsSync(file)) fs.unlinkSync(file);
            return send(200, { ok: true });
          }
          if (req.method !== "POST")
            return send(405, { error: { message: "Method Not Allowed" } });

          const chunks = [];
          for await (const c of req) chunks.push(c);
          const partial = JSON.parse(Buffer.concat(chunks).toString() || "{}");
          let existing = {};
          if (fs.existsSync(file))
            existing = JSON.parse(fs.readFileSync(file, "utf8"));
          const merged = { ...existing, ...partial };
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(file, JSON.stringify(merged, null, 2) + "\n");
          send(200, { ok: true, file: path.relative(process.cwd(), file) });
        } catch (err) {
          send(500, { error: { message: `파일 저장 실패: ${err.message}` } });
        }
      });
    },
  };
}

function omniRouteProxyPlugin() {
  return {
    name: "omniroute-api-proxy",
    configureServer(server) {
      server.middlewares.use("/api/usage", async (req, res) => {
        const env = loadEnv(server.config.mode, process.cwd(), "");
        const baseUrl = (env.OMNIROUTE_BASE_URL || "http://localhost:20128")
          .replace(/\/+$/, "")
          .replace(/\/v1$/, "");
        const token = env.OMNIROUTE_MANAGEMENT_TOKEN || "";
        res.setHeader("Content-Type", "application/json");
        if (!token) {
          res.statusCode = 400;
          res.end(
            JSON.stringify({
              error: {
                message: ".env에 OMNIROUTE_MANAGEMENT_TOKEN이 없습니다.",
              },
            }),
          );
          return;
        }
        const get = async (p) => {
          const r = await fetch(`${baseUrl}${p}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!r.ok) throw new Error(`${p} → ${r.status}`);
          return r.json();
        };
        try {
          const [history, logs, quota] = await Promise.all([
            get("/api/usage/history"),
            get("/api/usage/call-logs"),
            get("/api/usage/quota"),
          ]);
          // 토큰/계정 정보는 제외하고 필요한 필드만 전달
          res.end(
            JSON.stringify({
              totals: {
                requests: history.totalRequests,
                promptTokens: history.totalPromptTokens,
                completionTokens: history.totalCompletionTokens,
                cost: history.totalCost,
              },
              byProvider: history.byProvider,
              quota: (quota.providers || []).map((q) => ({
                provider: q.provider,
                percentRemaining: q.percentRemaining,
                quotaUsed: q.quotaUsed,
                quotaTotal: q.quotaTotal,
                resetAt: q.resetAt,
              })),
              recent: (Array.isArray(logs) ? logs : logs.logs || [])
                .slice(0, 15)
                .map((l) => ({
                  timestamp: l.timestamp,
                  provider: l.provider,
                  model: l.model,
                  requestedModel: l.requestedModel,
                  status: l.status,
                  duration: l.duration,
                  tokensIn: l.tokens?.in,
                  tokensOut: l.tokens?.out,
                })),
            }),
          );
        } catch (err) {
          res.statusCode = 502;
          res.end(
            JSON.stringify({
              error: { message: `사용량 조회 실패: ${err.message}` },
            }),
          );
        }
      });

      server.middlewares.use("/api/chat", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: { message: "Method Not Allowed" } }));
          return;
        }

        const env = loadEnv(server.config.mode, process.cwd(), "");
        const baseUrl = (
          env.OMNIROUTE_BASE_URL ||
          process.env.OMNIROUTE_BASE_URL ||
          "http://localhost:20128"
        )
          .replace(/\/+$/, "")
          .replace(/\/v1$/, "");
        const apiKey =
          env.OMNIROUTE_API_KEY || process.env.OMNIROUTE_API_KEY || "";

        try {
          const chunks = [];
          for await (const chunk of req) {
            chunks.push(chunk);
          }
          const rawBody = Buffer.concat(chunks).toString();

          const headers = {
            "Content-Type": "application/json",
          };
          if (apiKey) {
            headers["Authorization"] = `Bearer ${apiKey}`;
          }

          const upstreamRes = await fetch(`${baseUrl}/v1/chat/completions`, {
            method: "POST",
            headers,
            body: rawBody,
          });

          res.statusCode = upstreamRes.status;
          for (const [key, val] of upstreamRes.headers.entries()) {
            if (
              [
                "content-type",
                "cache-control",
                "transfer-encoding",
                "connection",
              ].includes(key.toLowerCase())
            ) {
              res.setHeader(key, val);
            }
          }

          if (upstreamRes.body) {
            const reader = upstreamRes.body.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              res.write(value);
            }
          }
          res.end();
        } catch (err) {
          res.statusCode = 502;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              error: {
                message: `OmniRoute 서버(${baseUrl}) 연결에 실패했습니다. OmniRoute가 실행 중인지 확인해주세요. (원인: ${err.message})`,
              },
            }),
          );
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  base: "./",
  plugins: [react(), omniRouteProxyPlugin(), contentFilePlugin()],
});
