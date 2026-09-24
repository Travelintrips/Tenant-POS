type ErrorLike = {
  message?: string;
  code?: string;
  cause?: unknown;
};

function errorChain(err: unknown): ErrorLike[] {
  const chain: ErrorLike[] = [];
  let current: unknown = err;

  for (let i = 0; i < 6 && current; i++) {
    if (current instanceof Error) {
      const e = current as Error & { code?: string; cause?: unknown };
      chain.push({ message: e.message, code: e.code, cause: e.cause });
      current = e.cause;
      continue;
    }

    if (typeof current === "object") {
      const e = current as ErrorLike;
      chain.push({ message: e.message, code: e.code, cause: e.cause });
      current = e.cause;
      continue;
    }

    chain.push({ message: String(current) });
    break;
  }

  return chain;
}

export function isTransientDbError(err: unknown): boolean {
  const chain = errorChain(err);
  const text = chain
    .map((e) => `${e.code ?? ""} ${e.message ?? ""}`)
    .join(" ")
    .toLowerCase();

  const codes = new Set(
    chain
      .map((e) => e.code)
      .filter((code): code is string => Boolean(code)),
  );

  if ([...codes].some((code) => code.startsWith("08"))) return true;

  return (
    codes.has("53300") ||
    codes.has("57P01") ||
    codes.has("57P02") ||
    codes.has("57P03") ||
    codes.has("ECONNRESET") ||
    codes.has("ECONNREFUSED") ||
    codes.has("ETIMEDOUT") ||
    codes.has("EPIPE") ||
    text.includes("emaxconnsession") ||
    text.includes("echeckoutfailed") ||
    text.includes("client socket closed") ||
    text.includes("connection terminated") ||
    text.includes("connection timeout") ||
    text.includes("timeout exceeded") ||
    text.includes("failed query")
  );
}

export async function withDbRetry<T>(
  fn: () => Promise<T>,
  options: { attempts?: number; label?: string } = {},
): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 4);
  const delays = [150, 400, 900, 1500];

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const transient = isTransientDbError(err);
      if (!transient || attempt >= attempts) throw err;

      const delay = delays[Math.min(attempt - 1, delays.length - 1)];
      const label = options.label ?? "db";
      const chain = errorChain(err)
        .map((e) => `${e.code ?? ""}:${e.message ?? ""}`)
        .join(" <- ");
      console.warn(
        `[db-retry] ${label} attempt ${attempt}/${attempts} gagal; retry ${delay}ms; ${chain}`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
