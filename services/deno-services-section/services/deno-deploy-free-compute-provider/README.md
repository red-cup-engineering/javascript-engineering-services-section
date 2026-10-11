# Deno Deploy Free Compute Provider

This provider supplies authenticated, low-latency, restart-safe deterministic
edge computation. Deployment and invocation are admitted only while Deno's live
organization record says `free_verified`; Deno pauses Free applications on
allowance exhaustion instead of charging overage.

The cloud app holds only an Ed25519 public key. The settlement-owned private key
signs requests locally and is never uploaded. Direct requests expire
after 15 minutes so the same authorization can survive bounded hosted-runner
admission without becoming a durable credential. The app exposes public
`GET /health` plus signed `POST /v1/sha256` and `POST /v1/pbkdf2`. It has no
outbound fetch, upload, shell, dependency, environment secret, database, queue,
cron, model, or persistent state.
