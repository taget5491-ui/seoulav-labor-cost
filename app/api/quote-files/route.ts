import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

async function currentUser() {
  const user = await getChatGPTUser();
  if (user) return user;
  if (process.env.NODE_ENV !== "production") return { userId: "local-preview", email: "preview@local" };
  return null;
}

function safeFilename(value: string) {
  return value.replace(/[\r\n"\\/]/g, "_").slice(0, 180) || "견적서.pdf";
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!env.BUCKET) return Response.json({ error: "파일 저장소에 연결할 수 없습니다." }, { status: 503 });

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return Response.json({ error: "PDF 파일을 선택해 주세요." }, { status: 400 });
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return Response.json({ error: "PDF 파일만 첨부할 수 있습니다." }, { status: 400 });
    if (file.size <= 0 || file.size > MAX_FILE_SIZE) return Response.json({ error: "PDF 파일은 10MB 이하만 첨부할 수 있습니다." }, { status: 400 });

    const key = `quotes/${crypto.randomUUID()}.pdf`;
    await env.BUCKET.put(key, file.stream(), {
      httpMetadata: { contentType: "application/pdf" },
      customMetadata: { originalName: safeFilename(file.name), uploadedBy: user.email },
    });
    return Response.json({ key, name: safeFilename(file.name), size: file.size });
  } catch (error) {
    console.error("Failed to upload quote PDF", error);
    return Response.json({ error: "견적서 PDF를 업로드하지 못했습니다." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!env.BUCKET) return Response.json({ error: "파일 저장소에 연결할 수 없습니다." }, { status: 503 });

  try {
    const key = new URL(request.url).searchParams.get("key") || "";
    if (!/^quotes\/[0-9a-f-]+\.pdf$/i.test(key)) return Response.json({ error: "올바르지 않은 파일 요청입니다." }, { status: 400 });
    const object = await env.BUCKET.get(key);
    if (!object) return Response.json({ error: "첨부파일을 찾을 수 없습니다." }, { status: 404 });
    const filename = safeFilename(object.customMetadata?.originalName || "견적서.pdf");
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("content-type", "application/pdf");
    headers.set("content-disposition", `inline; filename*=UTF-8''${encodeURIComponent(filename)}`);
    headers.set("cache-control", "private, max-age=300");
    return new Response(object.body, { headers });
  } catch (error) {
    console.error("Failed to read quote PDF", error);
    return Response.json({ error: "견적서 PDF를 열지 못했습니다." }, { status: 500 });
  }
}
