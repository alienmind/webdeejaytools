import { Account, RedactedAccount } from '../../shared/types.js';

/**
 * Strips secret values from an account before it crosses the API boundary.
 *
 * GET /api/accounts used to return the full record - Qobuz user_auth_token and Spotify
 * clientSecret included - to the browser on every page load. The UI only ever needs to know
 * whether a credential is present and enough of a hint to tell two accounts apart.
 */

function hint(value: string | undefined, keep = 4): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (trimmed.length <= keep) return '*'.repeat(trimmed.length);
  return `${'*'.repeat(Math.min(8, trimmed.length - keep))}${trimmed.slice(-keep)}`;
}

export function redactAccount(account: Account): RedactedAccount {
  const qobuz = account.credentials?.qobuz;
  const spotify = account.credentials?.spotify;

  return {
    id: account.id,
    service: account.service,
    label: account.label,
    email: account.email,
    username: account.username,
    avatarUrl: account.avatarUrl,
    isActive: account.isActive,
    credentialSummary: {
      qobuz: qobuz
        ? {
            hasUserAuthToken: Boolean(qobuz.userAuthToken),
            tokenHint: hint(qobuz.userAuthToken),
            hasPassword: Boolean(qobuz.password),
          }
        : undefined,
      spotify: spotify
        ? {
            hasClientId: Boolean(spotify.clientId),
            // The client ID is not a secret, but showing it whole invites pasting it around.
            clientIdHint: hint(spotify.clientId, 6),
            hasClientSecret: Boolean(spotify.clientSecret),
            hasAccessToken: Boolean(spotify.accessToken),
          }
        : undefined,
    },
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

export function redactAccounts(accounts: Account[]): RedactedAccount[] {
  return accounts.map(redactAccount);
}
