import { handleAsk } from "@/lib/aiServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** AI 호출은 서버에서만 합니다. API 키는 .env.local 의 GEMINI_API_KEY 에서 읽습니다. */
export async function POST(req: Request): Promise<Response> {
  const text = await req.text();
  const { status, body } = await handleAsk(text, {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    AI_MOCK: process.env.AI_MOCK,
  });
  return Response.json(body, { status });
}
