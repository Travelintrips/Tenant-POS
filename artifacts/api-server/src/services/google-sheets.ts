import { createSign } from "node:crypto";

type ServiceAccountCredentials = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

let tokenCache: { accessToken: string; expiresAt: number } | null = null;

function getCredentials(): ServiceAccountCredentials {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON tidak ditemukan di environment.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON bukan JSON yang valid.");
  }

  const creds = parsed as Partial<ServiceAccountCredentials>;
  if (!creds.client_email || !creds.private_key) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON tidak memiliki client_email/private_key yang lengkap.");
  }

  return {
    client_email: creds.client_email,
    private_key: creds.private_key,
    token_uri: creds.token_uri || "https://oauth2.googleapis.com/token",
  };
}

function encodeBase64Url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

async function getAccessToken(forceRefresh = false): Promise<string> {
  const now = Date.now();
  if (!forceRefresh && tokenCache && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.accessToken;
  }

  const creds = getCredentials();
  const nowSeconds = Math.floor(now / 1000);
  const header = encodeBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = encodeBase64Url(JSON.stringify({
    iss: creds.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: creds.token_uri,
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  }));
  const unsigned = `${header}.${payload}`;

  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(creds.private_key).toString("base64url");
  const assertion = `${unsigned}.${signature}`;

  if (typeof globalThis.fetch !== "function") {
    throw new Error("Runtime Node.js tidak menyediakan fetch untuk Google Sheets REST API.");
  }

  const response = await globalThis.fetch(creds.token_uri!, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const text = await response.text();
  let body: { access_token?: string; expires_in?: number; error?: string; error_description?: string } = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    // keep body empty; status below is enough for a safe diagnostic
  }

  if (!response.ok || !body.access_token) {
    const detail = body.error_description || body.error || `HTTP ${response.status}`;
    throw new Error(`Google service-account token gagal: ${detail}`);
  }

  const expiresIn = Number(body.expires_in ?? 3600);
  tokenCache = {
    accessToken: body.access_token,
    expiresAt: now + Math.max(300, expiresIn) * 1000,
  };
  return body.access_token;
}

async function googleRequest<T>(
  url: string,
  init: RequestInit = {},
  retryAuth = true,
): Promise<T> {
  const token = await getAccessToken();
  const response = await globalThis.fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });

  if (response.status === 401 && retryAuth) {
    tokenCache = null;
    const refreshed = await getAccessToken(true);
    const retry = await globalThis.fetch(url, {
      ...init,
      headers: {
        authorization: `Bearer ${refreshed}`,
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
    });
    const retryText = await retry.text();
    if (!retry.ok) {
      throw new Error(`Google Sheets API HTTP ${retry.status}: ${retryText.slice(0, 300)}`);
    }
    return (retryText ? JSON.parse(retryText) : {}) as T;
  }

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Google Sheets API HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

function sheetsBaseUrl(spreadsheetId: string): string {
  return `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`;
}

export function getServiceAccountEmail(): string {
  try {
    return getCredentials().client_email;
  } catch {
    return "(tidak tersedia)";
  }
}

export async function writeToSheet(opts: {
  spreadsheetId: string;
  sheetTitle: string;
  headers: string[];
  rows: (string | number | null)[][];
}): Promise<void> {
  const base = sheetsBaseUrl(opts.spreadsheetId);
  const meta = await googleRequest<{
    sheets?: Array<{ properties?: { sheetId?: number; title?: string } }>;
  }>(`${base}?fields=sheets.properties`);

  let sheet = meta.sheets?.find((s) => s.properties?.title === opts.sheetTitle);

  if (!sheet) {
    await googleRequest(`${base}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({
        requests: [{ addSheet: { properties: { title: opts.sheetTitle } } }],
      }),
    });

    const refreshed = await googleRequest<{
      sheets?: Array<{ properties?: { sheetId?: number; title?: string } }>;
    }>(`${base}?fields=sheets.properties`);
    sheet = refreshed.sheets?.find((s) => s.properties?.title === opts.sheetTitle);
  }

  const sheetId = sheet?.properties?.sheetId;
  if (sheetId === undefined) {
    throw new Error("Google Sheets API tidak mengembalikan sheetId.");
  }

  const range = `'${opts.sheetTitle.replace(/'/g, "''")}'!A:Z`;
  await googleRequest(
    `${base}/values/${encodeURIComponent(range)}:clear`,
    { method: "POST", body: "{}" },
  );

  const values = [opts.headers, ...opts.rows.map((row) => row.map((value) => value ?? ""))];
  await googleRequest(
    `${base}/values/${encodeURIComponent(`'${opts.sheetTitle.replace(/'/g, "''")}'!A1`)}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      body: JSON.stringify({ values }),
    },
  );

  await googleRequest(`${base}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      requests: [
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.18, green: 0.39, blue: 0.74 },
                textFormat: {
                  bold: true,
                  foregroundColor: { red: 1, green: 1, blue: 1 },
                },
              },
            },
            fields: "userEnteredFormat(backgroundColor,textFormat)",
          },
        },
        {
          autoResizeDimensions: {
            dimensions: {
              sheetId,
              dimension: "COLUMNS",
              startIndex: 0,
              endIndex: opts.headers.length,
            },
          },
        },
        {
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
            fields: "gridProperties.frozenRowCount",
          },
        },
      ],
    }),
  });
}

export async function readFromSheet(opts: {
  spreadsheetId: string;
  range: string;
}): Promise<string[][]> {
  const base = sheetsBaseUrl(opts.spreadsheetId);
  const result = await googleRequest<{ values?: unknown[][] }>(
    `${base}/values/${encodeURIComponent(opts.range)}?majorDimension=ROWS`,
  );

  return (result.values ?? []).map((row) =>
    row.map((value) => (value == null ? "" : String(value))),
  );
}

export function extractSheetId(input: string): string {
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  return input.trim();
}
