// server/llm/generator.js
import OpenAI from "openai";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

function base64(s) { return Buffer.from(s, "utf8").toString("base64"); }

export default {
  async generateApp({ brief, checks, attachments, seed }) {
    // SECURITY: instruct LLM to never include secrets
    const prompt = `
You are a generator. Produce a minimal static web app that satisfies the brief below.
Return exactly JSON: {"files":[{"path":"index.html","content":"<base64>"}, ...]}
Brief: ${brief}
Checks: ${JSON.stringify(checks)}
Attachments: ${JSON.stringify((attachments||[]).map(a=>a.name))}
Constraints:
- Use only static HTML/JS/CSS or small libs from CDN (no server code).
- DO NOT include any secrets or tokens.
- Keep code short and deterministic.
Produce only JSON, no commentary.
`;
    if (!openai) {
      // fallback: use simple templates for known patterns (sum-of-sales, markdown-to-html, small OCR sample)
      return fallbackGenerate({ brief, attachments, seed });
    }
    try {
      const resp = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1500
      });
      const text = resp.choices[0].message.content.trim();
      const json = JSON.parse(text);
      // validate
      if (!Array.isArray(json.files)) throw new Error("invalid generator output");
      // ensure content is base64; if plain text, base64 it
      for (const f of json.files) {
        if (!/^[A-Za-z0-9+/=]+\s*$/.test(f.content)) {
          f.content = base64(f.content);
        }
      }
      return json;
    } catch (e) {
      console.warn("LLM generation failed, using fallback", e.message);
      return fallbackGenerate({ brief, attachments, seed });
    }
  }
};

function fallbackGenerate({ brief, attachments, seed }) {
  // simple OCR sample: uses Tesseract.js and sample.png if provided
  const index = `<!doctype html>
<html><head><meta charset="utf-8"><title>${seed}</title></head><body>
<h1>${seed}</h1>
<img id="img" src="${attachments && attachments[0] ? attachments[0].name : 'sample.png'}" style="max-width:90%"/>
<div id="ocr">Solving...</div>
<script src="https://cdn.jsdelivr.net/npm/tesseract.js@4/dist/tesseract.min.js"></script>
<script>
(async()=> {
  const img = document.getElementById('img');
  img.onload = async () => {
    try {
      const { data: { text } } = await Tesseract.recognize(img.src);
      document.getElementById('ocr').textContent = text.trim() || '[no text]';
    } catch(e) {
      document.getElementById('ocr').textContent = 'OCR error';
    }
  };
})();
</script>
</body></html>`;
  return { files: [{ path: "index.html", content: Buffer.from(index,"utf8").toString("base64") },
                   { path: "README.md", content: Buffer.from(`# ${seed}\n\nAuto-generated fallback app\n`).toString("base64") }] };
}
