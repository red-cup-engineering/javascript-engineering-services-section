/** Agent-operation feed addressing. */
/**
 * stores/feed-token — typed decomposition of a feed token's own family
 * structure, the token leg `PATH_TY` (`path-term.mts`) treats as one opaque
 * `mark`.
 *
 * A literal feed token (`work-ledger`, `orientation`) is `mark(token)`. A
 * family member (`claude-session-<id>`, `codex-session-<id>`) is
 * structurally `pair(mark(family), mark(id))`, decomposed by `fst`/`snd` —
 * the same way `termPath` eliminates any other CHL product — never matched
 * by `token.startsWith(\`${family}-\`)` re-implemented at each call site
 * that needs the distinction (`services/filesystem/index.mts`'s
 * `commitFeedRecord`/`commitClaudeSessionSuitRecord` and
 * `services/state-cuts/index.mts`'s commit-size guard both did, verbatim,
 * before this module existed). One shared decomposition, checked by term
 * constructor, replaces the duplicated string test at both sites.
 */
import { tm, ty, type Tm, type Ty } from "@red-cup-engineering/relation-model-notation";
import { checkTy } from "@red-cup-engineering/relation-model-notation-typing";

/** The finite, named feed-token families this package currently derives a
 *  bespoke commit/read leg for. Adding a family is one entry here plus
 *  whatever leg consumes it — never a new ad hoc `startsWith` call site. */
export type FeedTokenFamily = "claude-session" | "codex-session";

const FEED_TOKEN_FAMILIES: readonly FeedTokenFamily[] = Object.freeze(["claude-session", "codex-session"]);

/** A family member's type: family × id, both marks at base. */
export const FEED_TOKEN_FAMILY_TY: Ty = ty.prod(ty.base(), ty.base());

/** Project a feed token to its own term: a family member becomes the
 *  `pair(mark(family), mark(id))` product; any other token stays the bare
 *  `mark(token)` a literal feed name already is under `PATH_TY`. */
export function feedTokenTerm(token: string): Tm {
  for (const family of FEED_TOKEN_FAMILIES) {
    const prefix = `${family}-`;
    if (token.startsWith(prefix) && token.length > prefix.length) {
      return tm.pair(tm.mark(family), tm.mark(token.slice(prefix.length)));
    }
  }
  return tm.mark(token);
}

/** One feed token's decomposed family membership. */
export interface FeedTokenFamilyMember {
  readonly family: FeedTokenFamily;
  readonly id: string;
}

/** Eliminate a feed token's term back to its family membership, or null when
 *  the term is the bare-mark (literal, non-family) case. `checkTy` guards
 *  the typing side, exactly as `termPath` guards `PATH_TY`; dispatch on
 *  family reads the term's own `fst`, never the original string again. */
export function feedTokenFamilyMember(token: string): FeedTokenFamilyMember | null {
  const term = feedTokenTerm(token);
  if (term[0] !== "pair" || !checkTy([], term, FEED_TOKEN_FAMILY_TY)) return null;
  const family = term[1][0] === "mark" ? term[1][1] : null;
  const id = term[2][0] === "mark" ? term[2][1] : null;
  if (family === null || id === null || !(FEED_TOKEN_FAMILIES as readonly string[]).includes(family)) return null;
  return Object.freeze({ family: family as FeedTokenFamily, id });
}

/** Whether a token structurally decomposes to the named family — the
 *  term-checked replacement for `token.startsWith(\`${family}-\`)`. */
export function feedTokenIsFamily(token: string, family: FeedTokenFamily): boolean {
  return feedTokenFamilyMember(token)?.family === family;
}
