const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
const code = (value: unknown) =>
  typeof value === "string" && /^[a-zA-Z0-9_:-]{1,80}$/.test(value)
    ? value
    : undefined;

// Never log provider messages, request bodies, response bodies or auth headers.
export function aiDiagnostics(error: unknown) {
  const source = record(error);
  const cause = record(source.cause);
  let provider: Record<string, unknown> = {};
  if (typeof cause.responseBody === "string") {
    try {
      provider = record(record(JSON.parse(cause.responseBody)).error);
    } catch {
      /* A non-JSON failure still has its HTTP status. */
    }
  }
  const status = source.statusCode ?? cause.statusCode;
  return {
    name: code(source.name) ?? "UnknownError",
    code: code(source.code),
    httpStatus:
      typeof status === "number" &&
      Number.isInteger(status) &&
      status >= 100 &&
      status <= 599
        ? status
        : undefined,
    providerType: code(provider.type) ?? code(source.type),
    providerCode: code(provider.code),
    causeName: code(cause.name),
  };
}
