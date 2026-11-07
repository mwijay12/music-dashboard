export class HttpError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string) {
    super(`HTTP ${status}: ${body.slice(0, 240)}`);
    this.name = "HttpError";
    this.status = status;
    this.body = body;
  }
}

interface FetchJsonOptions {
  retries?: number;
  timeoutMs?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchJson<T>(
  input: string | URL,
  init: RequestInit = {},
  options: FetchJsonOptions = {}
): Promise<T> {
  const retries = options.retries ?? 2;
  const timeoutMs = options.timeoutMs ?? 20_000;

  for (let attempt = 0; ; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(input, { ...init, signal: controller.signal });
      const text = await response.text();

      if (response.status === 429 || response.status >= 500) {
        if (attempt < retries) {
          const retryAfter = Number(response.headers.get("retry-after"));
          const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 900 * (attempt + 1);
          await sleep(Math.min(wait, 8_000));
          continue;
        }
      }

      if (!response.ok) throw new HttpError(response.status, text);
      return JSON.parse(text) as T;
    } catch (error) {
      if (attempt < retries && !(error instanceof HttpError)) {
        await sleep(600 * (attempt + 1));
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
