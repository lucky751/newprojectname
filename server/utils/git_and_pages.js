// server/utils/git_and_pages.js
import { execSync } from "child_process";
import path from "path";
import fs from "fs";

export async function createRepoAndDeploy({ repoDir, repoName, ghUser }) {
  try {
    // init git
    execSync("git init -b main", { cwd: repoDir });
    execSync("git add .", { cwd: repoDir });
    execSync(`git commit -m "Initial commit"`, { cwd: repoDir });

    // create remote via gh CLI and push
    console.log("Creating repo via gh");
    execSync(`gh repo create ${ghUser}/${repoName} --public --source=${repoDir} --remote=origin --push`, { cwd: repoDir, stdio: "inherit" });

    // enable Pages using gh (deploy from main / root)
    console.log("Enabling GitHub Pages");
    // gh has pages deploy cmd
    try {
      execSync(`gh pages deploy --repo ${ghUser}/${repoName} --branch main --path .`, { cwd: repoDir, stdio: "inherit" });
    } catch (e) {
      // fallback: use API to enable pages
      console.warn("gh pages failed:", e.message);
    }

    // get commit sha
    const sha = execSync("git rev-parse HEAD", { cwd: repoDir }).toString().trim();

    // Poll pages until 200 or timeout (2 minutes)
    const pagesUrl = `https://${ghUser}.github.io/${repoName}/`;
    const end = Date.now() + 2*60*1000;
    while (Date.now() < end) {
      try {
        const r = execSync(`curl -s -o /dev/null -w "%{http_code}" ${pagesUrl}`).toString().trim();
        if (r === "200") {
          console.log("Pages ready:", pagesUrl);
          break;
        }
      } catch (_) {}
      await new Promise(r=>setTimeout(r,2000));
    }

    return sha;
  } catch (e) {
    console.error("git deploy error:", e.message);
    throw e;
  }
}
