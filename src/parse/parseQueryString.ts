import * as p from "./combinator";

export function parseQueryString(queryString: string): Map<string, string> {
  const params = new Map<string, string>();
  const pairs = queryString.split("&");
  for (const pair of pairs) {
    const [key, value] = pair.split("=");
    if (key && value) {
      params.set(decodeURIComponent(key), value);
    }
  }
  return params;
}

export function parseQueryStringValue(queryString: string): Uint8Array {
  const result = p.parseRepeated(
    p.alt(
      p.map(
        p.sequence(
          p.tag("%"),
          p.takeExactly(
            2,
            p.parseMatching((input) => /[0-9a-fA-F]/.test(input)),
          ),
        ),
        ([_, char]) => parseInt(char.join(""), 16),
      ),
      p.map(
        p.parseMatching(
          (char) =>
            true
        ),
        (char) => char.charCodeAt(0),
      ),
    ),
  )(queryString);

  if (!result || result.remaining.length > 0) {
    throw new Error("invalid query string");
  }

  return new Uint8Array(result.value);
}
