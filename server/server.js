// server/server.js
import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { execSync } from "child_process";
import generator from "./llm/generator.js";
import { createRepoAndDeploy } from "./utils/git_and_pages.js";
import crypto from "crypto";

dotenv.config();
const PORT = process.env.PORT || 3000;
const SHARED_SECRET = process.env.SHARED_SECRET; // set in .env
const GH_USER = process.env.GH_USER; // GitHub username
if (!SHARED_SECRET || !GH_USER) {
  console.error("Missing SHARED_SECRET or GH_USER in env");
  process.exit(1);
}

const app = express();
app.use(bodyParser.json({ limit: "50mb" }));

// helper: exponential backoff retry for evaluation_url
async function postWithRetries(url, body) {
  let attempt = 0;
  let delay = 1000;
  while (attempt < 8) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (r.status === 200) return true;
      console.warn("Evaluation POST status", r.status);
    } catch (e) {
      console.warn("Post attempt error:", e.message);
    }
    await new Promise(r => setTimeout(r, delay));
    attempt++;
    delay *= 2;
  }
  return false;
}

app.post("/api/submit", async (req, res) => {
  try {
    const payload = req.body;
    // required fields
    const required = ["email","secret","task","round","nonce","brief","evaluation_url"];
    for (const k of required) if (!payload[k]) return res.status(400).json({ error: `${k} missing` });

    // verify secret
    if (payload.secret !== SHARED_SECRET) return res.status(403).json({ error: "invalid secret" });

    // Immediate ack per spec
    res.status(200).json({ status: "accepted", task: payload.task, round: payload.round });

    // Continue processing (do everything now)
    console.log("Handling task:", payload.task);

    // create a temp dir
    const tmp = path.join("/tmp", `${payload.task}-${Date.now()}`);
    fs.mkdirSync(tmp, { recursive: true });

    // Save attachments (if any)
    if (Array.isArray(payload.attachments)) {
      for (const a of payload.attachments) {
        const filePath = path.join(tmp, a.name);
        const commaIdx = a.url.indexOf(",");
        const dataBase64 = (commaIdx >= 0) ? a.url.slice(commaIdx+1) : a.url;
        fs.writeFileSync(filePath, Buffer.from(dataBase64, "base64"));
      }
    }

    // Generate app files using LLM generator (local helper that calls LLM API)
    const generated = await generator.generateApp({
      brief: payload.brief,
      checks: payload.checks || [],
      attachments: payload.attachments || [],
      seed: payload.task
    });

    // write generated files to repoDir
    const repoName = payload.task.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
    const repoDir = path.join(tmp, repoName);
    fs.mkdirSync(repoDir, { recursive: true });

    for (const f of generated.files) {
      const p = path.join(repoDir, f.path);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, Buffer.from(f.content, "base64"));
    }

    // Ensure MIT LICENSE & README (generator should include but ensure)
    if (!fs.existsSync(path.join(repoDir, "LICENSE"))) {
      const mit = `MIT License\n\nCopyright (c) ${new Date().getFullYear()} ${payload.email}\n\nPermission is hereby...`;
      fs.writeFileSync(path.join(repoDir, "LICENSE"), mit);
    }
    if (!fs.existsSync(path.join(repoDir, "README.md"))) {
      const readme = `# ${repoName}\n\nBrief: ${payload.brief}\n\nUsage: open index.html or visit pages url\n`;
      fs.writeFileSync(path.join(repoDir, "README.md"), readme);
    }

    // Run security scan placeholder (optional external tool)
    // TODO: integrate gitleaks/trufflehog here

    // Create repo, push and enable pages
    const commitSha = await createRepoAndDeploy({ repoDir, repoName, ghUser: process.env.GH_USER });

    // Compose callback payload
    const callback = {
      email: payload.email,
      task: payload.task,
      round: payload.round,
      nonce: payload.nonce,
      repo_url: `https://github.com/${GH_USER}/${repoName}`,
      commit_sha: commitSha,
      pages_url: `https://${GH_USER}.github.io/${repoName}/`
    };

    const ok = await postWithRetries(payload.evaluation_url, callback);
    console.log("Notified evaluation_url:", ok);
  } catch (err) {
    console.error("Server error:", err);
  }
});

app.listen(PORT, () => console.log("Server running on", PORT));
