# instructor/evaluate.py (outline)
# For each repo row in repos table:
# 1) verify created after task time
# 2) fetch repo at commit_sha and check LICENSE
# 3) fetch README.md and call LLM for quality
# 4) run Playwright against pages_url executing checks
# 5) save results to results table
