# Node Job Service

Owns released job declarations, transient systemd user units, credential
bindings, completion receipts and demand readings. The runtime compiler and
operating sections consume this package directly.

Jobs come from a deployment's committed declarations or an installed runtime
configuration. An installed artifact is an absolute release path; Guix store
paths and ordinary versioned release directories use the same operation.

The recorder and host-state replication programs live in `scripts/`.
Extracted from Code Services with the package's five-commit history retained.

## Complete installed-programme diagnostics

`nodeJobProgramEntries({runtimeRoot, jobsDirectory, missingPrograms: "retain"})` retains absent programme/preload/finalizer paths so an installed-interface assessor can diagnose the complete graph. All declarations still pass the same canonical validation as running jobs, including directory, argv, trigger, environment and custody checks. Paths resolve against each job directory and cannot escape the runtime. The default `missingPrograms: "error"` continues to refuse absent owner directories or programmes. Neither mode executes jobs.


## Placement

Each node job runs on whichever fleet node can do it most cheaply right now. The nodes decide this themselves from a grow-only substrate of facts. No planner exists, and no record is shared.

### Why

Production work was tied to hosts by static data (`instance.json` `host`, per-host credential names, unit prefixes). When the single host saturated or was stopped by hand, Koios.News stopped publishing, and nothing noticed, moved the work, or repaired it.

The first fix used a shared `placement.json` that every node rewrote. That design is non-monotone, so it needs coordination everywhere. This one follows the group's research on coordination:

- **Stigmergy.** Nodes coordinate by writing to a shared environment of plain files, not by messaging a planner.
- **Grow-only facts.** The substrate only grows, and merging two copies is set union, so it converges without coordination (CALM).
- **Coordination only where claims overlap.** Coordination is spent only where two claims meet: two able nodes and one job window, which is the nerve's b₁ in the coordination-obstruction note.
- **Bounded local decisions.** Each node decides from its own observation and the bids for one window.

### Specification

**Declarations.** A node-job declaration may add the following:

```json
"requires": { "capabilities": ["systemd-user", "guix"], "memoryGb": 1, "cores": 1, "freeDiskGb": 2 },
"placement": { "pinned": ["node-id"], "why": "holds the only YouTube Studio session" },
"exclusive": true
```

`credentials` is a requirement as well. Set `exclusive` only when a duplicate run causes harm, such as publishing or uploading twice.

**Refusals are static; contention is a price.** A node refuses a job only for facts that don't change minute to minute: a missing capability, a missing credential, a declaration it doesn't carry, a pin, or too few cores. Load per core and the job's share of free memory and free disk make up its `costOf`, never a refusal. The only node able to run a job therefore still runs it under contention, and the watch reports the price.

**Facts** (git branch `fleet-facts`). Only the files a node writes about itself:

| Path | Writer | Meaning |
|---|---|---|
| `nodes/<id>.json` | that node, every 5 min | `node-job-node-observation/v1` with `{ id, observedAt, capabilities[], cores, memoryGb, memoryAvailableGb, load1, freeDiskGb, credentials[], jobs[], refuses{job: [why]}, costs{job: price} }`. It is a single-writer register, and the newer value supersedes the older. |
| `jobs/<id>.json` | every node that carries it | The declaration as deployed. |
| `bids/<job>/<window>/<node>.json` | a bidding node | `node-job-bid/v1` `{ cost }`. Added, never edited. |
| `runs/<job>/<window>/<node>.json` | the node that ran it | `node-job-fleet-run/v1`. Added, never edited. |

A window is the job's own `everySeconds` period, or 5 minutes for calendar and demand triggers.

**Claim** (`claimWindow`, called by `runNodeJob` when `NODE_JOB_FLEET` names the node's clone):

1. If the node refuses the job, it returns `refused-here`.
2. Otherwise the node waits `backoffMs(cost)`: 10 s per unit of cost, capped at 60 s. A cheap node bids at once and a contended one waits.
3. It pulls the substrate. If another node already bid for this window, it returns `claimed-elsewhere`.
4. Otherwise it adds its bid and pushes. The node whose bid entered history first runs the window. Git's push serialization is the one coordination point, and it is used only for this window's overlap.
5. If the substrate can't be reached, a tolerant job runs anyway (`uncoordinated`), and an `exclusive` job doesn't (`fleet-unreachable`).
6. A started run is recorded under `runs/`.

**Servability** (`servability(jobs, nodes)`) is how a reader such as the production outcome watch sees each job. It shows the alive carriers able to run the job with their published cost, and why every other carrier can't. A job with no able carrier, or whose cheapest able carrier is overcommitted (cost above 1), is broken and is reported as such.

### Joining a node

```sh
git clone https://github.com/red-cup-engineering/node-job-service ~/.local/share/node-fleet/node-job-service
node ~/.local/share/node-fleet/node-job-service/scripts/install-fleet-sync.mjs \
  --store https://github.com/coesite-operations/operations-services-section.git \
  --credentials <rendered credentials dir> --jobs <deploy/jobs dir> ...
```

The installer clones the `fleet-facts` branch and installs the `node-fleet-sync` user timer. It also exports `NODE_JOB_NODE_ID` and `NODE_JOB_FLEET` through `environment.d` to every unit the user manager starts. Capabilities such as `systemd-user` and `guix` are detected from the OS; `--capability` adds only what the OS can't show.

No node is special. A lost node only stops publishing, its observation goes stale, and the other carriers win its windows.

## Read the writers of an installed selection

The builtin-only `node-job-receive-writers /absolute/private-selection.json`
command and `./selected-job-writer-receiving` export receive only the declared
job units of one source-bound installed configuration. They never start, stop
or retry a job. Select exact declaration, producer/recorder, consumer, Node and
native-tool hashes; the default native command allocation is 30 seconds.

The result keeps two axes: current native Job/main/control/cohort facts and the
original last-recorded outcome/demand/partial-file custody. A missing or
collected unit does not invent a successful historical result; an unreadable
historical receipt does not invent a current writer. A current-writer
observation is not a future admission fence. The complete source contract and
qualification boundary is [selected-job-writer-receiving](specifications/selected-job-writer-receiving.md).
