export interface QobuzBundleSecrets {
  appId: string;
  secrets: Record<string, string>;
  fetchedAt: number;
}

// Current Qobuz Web Player production secrets
const FALLBACK_SECRETS: QobuzBundleSecrets = {
  appId: '798273057',
  secrets: {
    base: 'abb21364945c0583309667d13ca3d93a',
    track_getFileUrl: 'abb21364945c0583309667d13ca3d93a',
    user_getUserFavorites: 'abb21364945c0583309667d13ca3d93a',
  },
  fetchedAt: Date.now(),
};

let cachedSecrets: QobuzBundleSecrets | null = null;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function getQobuzBundleSecrets(forceRefresh = false): Promise<QobuzBundleSecrets> {
  if (!forceRefresh && cachedSecrets && Date.now() - cachedSecrets.fetchedAt < CACHE_TTL_MS) {
    return cachedSecrets;
  }

  try {
    const loginPageRes = await fetch('https://play.qobuz.com/login', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!loginPageRes.ok) {
      return FALLBACK_SECRETS;
    }

    const html = await loginPageRes.text();
    const scriptMatches = Array.from(html.matchAll(/<script[^>]+src=["']([^"']+\.js)["']/gi)).map((m) => m[1]);

    let foundAppId: string | null = null;
    let foundSecret: string | null = null;
    const extractedSecrets: Record<string, string> = { ...FALLBACK_SECRETS.secrets };

    for (const scriptPath of scriptMatches) {
      const scriptUrl = scriptPath.startsWith('http') ? scriptPath : `https://play.qobuz.com${scriptPath}`;
      try {
        const scriptRes = await fetch(scriptUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        });

        if (!scriptRes.ok) continue;
        const scriptText = await scriptRes.text();

        // 1. Match appId
        const prodMatch = scriptText.match(/production\s*:\s*\{[^\}]*api\s*:\s*\{[^\}]*appId\s*:\s*["'](\d+)["']/i);
        if (prodMatch) {
          foundAppId = prodMatch[1];
        }

        // 2. Match dynamic seed for Berlin timezone in production: c.initialSeed("...", window.utimezone.berlin)
        const seedMatch = scriptText.match(/initialSeed\s*\(\s*["']([a-zA-Z0-9+=]+)["']\s*,\s*window\.utimezone\.berlin\s*\)/);
        const berlinMatch = scriptText.match(/name\s*:\s*["']Europe\/Berlin["'][^}]*info\s*:\s*["']([a-zA-Z0-9+=]+)["'][^}]*extras\s*:\s*["']([a-zA-Z0-9+=]+)["']/);

        if (seedMatch && berlinMatch) {
          const seed = seedMatch[1];
          const info = berlinMatch[1];
          const extras = berlinMatch[2];
          const combined = seed + info + extras;
          const substr = combined.substring(0, combined.length - 44);
          const decoded = Buffer.from(substr, 'base64').toString('utf8');
          if (decoded && decoded.length === 32) {
            foundSecret = decoded;
          }
        }
      } catch {}
    }

    const finalSecret = foundSecret || FALLBACK_SECRETS.secrets.track_getFileUrl;
    extractedSecrets.base = finalSecret;
    extractedSecrets.track_getFileUrl = finalSecret;
    extractedSecrets.user_getUserFavorites = finalSecret;

    cachedSecrets = {
      appId: foundAppId || FALLBACK_SECRETS.appId,
      secrets: extractedSecrets,
      fetchedAt: Date.now(),
    };

    return cachedSecrets;
  } catch {
    return FALLBACK_SECRETS;
  }
}
