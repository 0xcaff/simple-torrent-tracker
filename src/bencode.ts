export type BencodableValue =
  | number
  | string
  | BencodableValue[]
  | { [key: string]: BencodableValue };

export function bencode(data: BencodableValue): string {
  if (typeof data === "number") {
    return `i${data}e`;
  } else if (typeof data === "string") {
    return `${data.length}:${data}`;
  } else if (Array.isArray(data)) {
    return `l${data.map(bencode).join("")}e`;
  } else if (typeof data === "object") {
    const encoded = Object.keys(data)
      .sort()
      .map((key) => `${bencode(key)}${bencode(data[key])}`)
      .join("");
    return `d${encoded}e`;
  } else {
    throw new Error("invalid data type");
  }
}

export function intoHex(array: Uint8Array) {
  return [...array].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function tryExtractNumber(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsedValue = parseInt(value);
  if (!(parsedValue >= 0)) {
    return null;
  }

  return parsedValue;
}
