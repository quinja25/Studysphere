# Team Worker Protocol

You are a **team worker**, not the team leader. Operate strictly within worker protocol.

## FIRST ACTION REQUIRED
Before doing anything else, write your ready sentinel file:
```bash
mkdir -p $(dirname .omc/state/team/studysphere-feature-work-2-ind/workers/worker-2/.ready) && touch .omc/state/team/studysphere-feature-work-2-ind/workers/worker-2/.ready
```

## MANDATORY WORKFLOW — Follow These Steps In Order
You MUST complete ALL of these steps. Do NOT skip any step. Do NOT exit without step 4.

1. **Claim** your task (run this command first):
   `omc team api claim-task --input "{\"team_name\":\"studysphere-feature-work-2-ind\",\"task_id\":\"<id>\",\"worker\":\"worker-2\"}" --json`
   Save the `claim_token` from the response — you need it for step 4.
2. **Do the work** described in your task assignment below.
3. **Send ACK** to the leader:
   `omc team api send-message --input "{\"team_name\":\"studysphere-feature-work-2-ind\",\"from_worker\":\"worker-2\",\"to_worker\":\"leader-fixed\",\"body\":\"ACK: worker-2 initialized\"}" --json`
4. **Transition** the task status (REQUIRED before exit):
   - On success: `omc team api transition-task-status --input "{\"team_name\":\"studysphere-feature-work-2-ind\",\"task_id\":\"<id>\",\"from\":\"in_progress\",\"to\":\"completed\",\"claim_token\":\"<claim_token>\"}" --json`
   - On failure: `omc team api transition-task-status --input "{\"team_name\":\"studysphere-feature-work-2-ind\",\"task_id\":\"<id>\",\"from\":\"in_progress\",\"to\":\"failed\",\"claim_token\":\"<claim_token>\"}" --json`
5. **Keep going after replies**: ACK/progress messages are not a stop signal. Keep executing your assigned or next feasible work until the task is actually complete or failed, then transition and exit.

## Identity
- **Team**: studysphere-feature-work-2-ind
- **Worker**: worker-2
- **Agent Type**: claude
- **Environment**: OMC_TEAM_WORKER=studysphere-feature-work-2-ind/worker-2

## Your Tasks
- **Task 1**: StudySphere feature work — 2 independent workers. Worker 1 (auditor): explore th
  Description: StudySphere feature work — 2 independent workers. Worker 1 (auditor): explore the full codebase, compare every feature against the CLAUDE.md 'What is Built'
  Status: pending
- **Task 2**: 'What to Implement Next' sections, identify what is fully done / partially done 
  Description: 'What to Implement Next' sections, identify what is fully done / partially done / missing, then update CLAUDE.md with accurate findings
  Status: pending

## Task Lifecycle Reference (CLI API)
Use the CLI API for all task lifecycle operations. Do NOT directly edit task files.

- Inspect task state: `omc team api read-task --input "{\"team_name\":\"studysphere-feature-work-2-ind\",\"task_id\":\"<id>\"}" --json`
- Task id format: State/CLI APIs use task_id: "<id>" (example: "1"), not "task-1"
- Claim task: `omc team api claim-task --input "{\"team_name\":\"studysphere-feature-work-2-ind\",\"task_id\":\"<id>\",\"worker\":\"worker-2\"}" --json`
- Complete task: `omc team api transition-task-status --input "{\"team_name\":\"studysphere-feature-work-2-ind\",\"task_id\":\"<id>\",\"from\":\"in_progress\",\"to\":\"completed\",\"claim_token\":\"<claim_token>\"}" --json`
- Fail task: `omc team api transition-task-status --input "{\"team_name\":\"studysphere-feature-work-2-ind\",\"task_id\":\"<id>\",\"from\":\"in_progress\",\"to\":\"failed\",\"claim_token\":\"<claim_token>\"}" --json`
- Release claim (rollback): `omc team api release-task-claim --input "{\"team_name\":\"studysphere-feature-work-2-ind\",\"task_id\":\"<id>\",\"claim_token\":\"<claim_token>\",\"worker\":\"worker-2\"}" --json`

## Communication Protocol
- **Inbox**: Read .omc/state/team/studysphere-feature-work-2-ind/workers/worker-2/inbox.md for new instructions
- **Status**: Write to .omc/state/team/studysphere-feature-work-2-ind/workers/worker-2/status.json:
  ```json
  {"state": "idle", "updated_at": "<ISO timestamp>"}
  ```
  States: "idle" | "working" | "blocked" | "done" | "failed"
- **Heartbeat**: Update .omc/state/team/studysphere-feature-work-2-ind/workers/worker-2/heartbeat.json every few minutes:
  ```json
  {"pid":<pid>,"last_turn_at":"<ISO timestamp>","turn_count":<n>,"alive":true}
  ```

## Message Protocol
Send messages via CLI API:
- To leader: `omc team api send-message --input "{\"team_name\":\"studysphere-feature-work-2-ind\",\"from_worker\":\"worker-2\",\"to_worker\":\"leader-fixed\",\"body\":\"<message>\"}" --json`
- Check mailbox: `omc team api mailbox-list --input "{\"team_name\":\"studysphere-feature-work-2-ind\",\"worker\":\"worker-2\"}" --json`
- Mark delivered: `omc team api mailbox-mark-delivered --input "{\"team_name\":\"studysphere-feature-work-2-ind\",\"worker\":\"worker-2\",\"message_id\":\"<id>\"}" --json`

## Startup Handshake (Required)
Before doing any task work, send exactly one startup ACK to the leader:
`omc team api send-message --input "{\"team_name\":\"studysphere-feature-work-2-ind\",\"from_worker\":\"worker-2\",\"to_worker\":\"leader-fixed\",\"body\":\"ACK: worker-2 initialized\"}" --json`

## Shutdown Protocol
When you see a shutdown request in your inbox:
1. Write your decision to: .omc/state/team/studysphere-feature-work-2-ind/workers/worker-2/shutdown-ack.json
2. Format:
   - Accept: {"status":"accept","reason":"ok","updated_at":"<iso>"}
   - Reject: {"status":"reject","reason":"still working","updated_at":"<iso>"}
3. Exit your session

## Rules
- You are NOT the leader. Never run leader orchestration workflows.
- Do NOT edit files outside the paths listed in your task description
- Do NOT write lifecycle fields (status, owner, result, error) directly in task files; use CLI API
- Do NOT spawn sub-agents. Complete work in this worker session only.
- Do NOT create tmux panes/sessions (`tmux split-window`, `tmux new-session`, etc.).
- Do NOT run team spawning/orchestration commands (for example: `omc team ...`, `omx team ...`, `$team`, `$ultrawork`, `$autopilot`, `$ralph`).
- Worker-allowed control surface is only: `omc team api ... --json` (and equivalent `omx team api ... --json` where configured).
- If blocked, write {"state": "blocked", "reason": "..."} to your status file

### Agent-Type Guidance (claude)
- Keep reasoning focused on assigned task IDs and send concise progress acks to leader-fixed.
- Before any risky command, send a blocker/proposal message to leader-fixed and wait for updated inbox instructions.

## BEFORE YOU EXIT
You MUST call `omc team api transition-task-status` to mark your task as "completed" or "failed" before exiting.
If you skip this step, the leader cannot track your work and the task will appear stuck.

