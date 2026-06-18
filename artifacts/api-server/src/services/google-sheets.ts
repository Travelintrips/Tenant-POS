type GoogleType = typeof import("googleapis");

let _google: GoogleType["google"] | null = null;

function getGoogleLib(): GoogleType["google"] {
  if (!_google) {
    // Lazy-load googleapis hanya saat pertama dibutuhkan.
    // Ini mencegah require('googleapis') gagal saat bundle dimuat di production
    // jika symlink pnpm belum terbentuk saat startup.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _google = (require("googleapis") as GoogleType).google;
  }
  return _google;
}

function getAuth() {
  const google = getGoogleLib();
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON tidak ditemukan di environment.");
  let creds: Record<string, unknown>;
  try {
    creds = JSON.parse(raw);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON bukan JSON yang valid.");
  }
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

export function getServiceAccountEmail(): string {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return "(tidak tersedia)";
  try {
    const creds = JSON.parse(raw) as { client_email?: string };
    return creds.client_email ?? "(tidak tersedia)";
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
  const google = getGoogleLib();
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const meta = await sheets.spreadsheets.get({ spreadsheetId: opts.spreadsheetId });
  const existingSheet = meta.data.sheets?.find(
    (s) => s.properties?.title === opts.sheetTitle,
  );

  if (existingSheet) {
    const sheetId = existingSheet.properties!.sheetId!;
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: opts.spreadsheetId,
      requestBody: {
        requests: [
          {
            updateCells: {
              range: { sheetId, startRowIndex: 0, startColumnIndex: 0 },
              fields: "userEnteredValue",
            },
          },
        ],
      },
    });
  } else {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: opts.spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: opts.sheetTitle } } }],
      },
    });
  }

  const values = [opts.headers, ...opts.rows.map((r) => r.map((v) => v ?? ""))];
  await sheets.spreadsheets.values.update({
    spreadsheetId: opts.spreadsheetId,
    range: `'${opts.sheetTitle}'!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });

  const updatedMeta = await sheets.spreadsheets.get({ spreadsheetId: opts.spreadsheetId });
  const sheet = updatedMeta.data.sheets?.find((s) => s.properties?.title === opts.sheetTitle);
  const sheetId = sheet?.properties?.sheetId ?? 0;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: opts.spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.18, green: 0.39, blue: 0.74 },
                textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
              },
            },
            fields: "userEnteredFormat(backgroundColor,textFormat)",
          },
        },
        {
          autoResizeDimensions: {
            dimensions: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: opts.headers.length },
          },
        },
        {
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
            fields: "gridProperties.frozenRowCount",
          },
        },
      ],
    },
  });
}

export async function readFromSheet(opts: {
  spreadsheetId: string;
  range: string;
}): Promise<string[][]> {
  const google = getGoogleLib();
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: opts.spreadsheetId,
    range: opts.range,
  });
  return (res.data.values ?? []) as string[][];
}

export function extractSheetId(input: string): string {
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  return input.trim();
}
