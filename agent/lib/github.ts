import { connectGitHubCredentials } from "@vercel/connect/eve";

/**
 * Vercel Connect connector UID for GitHub.
 *
 * @defaultValue `"github/lockstep"`, the UID that `vercel connect create github --name lockstep`
 * produces (UIDs are `<type>/<name>`). Override with `GITHUB_CONNECTOR` when the connector was
 * created under a different name, which it will be for anyone who names their deployment after
 * their own team rather than after this template.
 */
export const GITHUB_CONNECTOR = process.env.GITHUB_CONNECTOR ?? "github/lockstep";

/**
 * Credentials for both the channel and the tool surface.
 *
 * @remarks
 * Connect holds the GitHub App, mints the installation token per call, and verifies inbound
 * webhooks by their Vercel OIDC signature, so there is no app id, private key, or webhook secret
 * stored in the deployment or reachable by the model. That matters more here than in most agents:
 * this one spends its run reading changelogs and third-party dependency source, and a credential it
 * cannot see is one no amount of injected text can talk it into revealing.
 */
export const githubCredentials = connectGitHubCredentials(GITHUB_CONNECTOR);

let cachedBotName: string | undefined;

/**
 * The name this agent answers to in a pull request thread, resolved rather than configured.
 *
 * @remarks
 * This is deliberately not a constant, and the difference matters for a template. Every deployment
 * of this repository installs its *own* GitHub App under its own name, so a hardcoded handle would
 * be wrong for everyone except whoever wrote it: the agent would sit in a thread failing to
 * recognise mentions of itself, with nothing in the logs to say why.
 *
 * So the name comes from the App's own slug, the way the deployer named it, with `GITHUB_APP_SLUG`
 * as an override for a self-managed App. The channel does the same resolution internally when
 * `botName` is left unset; this exists because the comment hook needs the resolved value too.
 *
 * Fails closed: an unresolvable name means mentions are not dispatched rather than matched against
 * a guess. Cached on success, retried on the next event after a failure, so one bad delivery cannot
 * pin the channel to a missing name.
 */
export async function resolveBotName(): Promise<string | undefined> {
  if (cachedBotName !== undefined) return cachedBotName;

  const slug = (githubCredentials as { appSlug?: string | (() => string | Promise<string>) }).appSlug;
  const resolved = typeof slug === "function" ? await slug() : slug;

  cachedBotName = resolved ?? process.env.GITHUB_APP_SLUG;
  return cachedBotName;
}

/** Matches `@name` as a word, which is what the GitHub channel treats as an invocation token. */
export function mentionPattern(botName: string): RegExp {
  return new RegExp(`@${botName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
}
