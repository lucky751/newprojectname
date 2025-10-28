# instructor/round1.py
import csv, requests, hashlib, uuid, time
SUBMISSIONS = "submissions.csv"  # columns: timestamp,email,endpoint,secret
TEMPLATES = ["sum-of-sales","markdown-to-html","github-user-created"]

def make_task(email, seed_template):
    # simple deterministic seed
    seed = hashlib.sha1((email + seed_template).encode()).hexdigest()[:6]
    task_id = f"{seed_template}-{seed}"
    nonce = str(uuid.uuid4())
    brief = "Use template " + seed_template
    evaluation_url = "http://instructor-host:5000/notify"  # instructor endpoint
    checks = []
    attachments = []
    return {"email": email, "task": task_id, "round": 1, "nonce": nonce, "brief": brief, "checks": checks, "evaluation_url": evaluation_url, "attachments": attachments}

with open(SUBMISSIONS) as f:
    for row in csv.DictReader(f):
        endpoint = row['endpoint']
        email = row['email']
        t = make_task(email, TEMPLATES[hash(email)%len(TEMPLATES)])
        try:
            r = requests.post(endpoint, json={**t, "secret": row['secret']}, timeout=30)
            print(email, r.status_code)
        except Exception as e:
            print("error", e)
        time.sleep(1)
