export type ParseResult<T> = {
  remaining: string;
  value: T;
};

export type Parser<T> = (input: string) => ParseResult<T> | null;

export function map<T1, T2>(
  parser: Parser<T1>,
  fn: (value: T1) => T2,
): Parser<T2> {
  return (input) => {
    const result = parser(input);
    if (!result) {
      return null;
    }

    return {
      remaining: result.remaining,
      value: fn(result.value),
    };
  };
}

export function sequence<T1, T2>(
  parser1: Parser<T1>,
  parser2: Parser<T2>,
): Parser<[T1, T2]> {
  return (input) => {
    const result1 = parser1(input);
    if (!result1) {
      return null;
    }

    const result2 = parser2(result1.remaining);
    if (!result2) {
      return null;
    }

    return {
      remaining: result2.remaining,
      value: [result1.value, result2.value],
    };
  };
}

export function alt<T>(parser1: Parser<T>, parser2: Parser<T>): Parser<T> {
  return (input) => {
    const result1 = parser1(input);
    if (result1) {
      return result1;
    }

    const result2 = parser2(input);
    if (result2) {
      return result2;
    }

    return null;
  };
}

export function tag(value: string): Parser<string> {
  return (input) => {
    if (input.startsWith(value)) {
      return {
        remaining: input.slice(value.length),
        value,
      };
    } else {
      return null;
    }
  };
}

export function takeExactly<Inner>(
  count: number,
  parse: Parser<Inner>,
): Parser<Inner[]> {
  return (input) => {
    const results: Inner[] = [];
    let remaining = input;

    for (let i = 0; i < count; i++) {
      const result = parse(remaining);
      if (!result) {
        return null;
      }

      results.push(result.value);
      remaining = result.remaining;
    }

    return {
      remaining,
      value: results,
    };
  };
}

export function parseRepeated<Inner>(parseFn: Parser<Inner>): Parser<Inner[]> {
  return (input) => {
    const results: Inner[] = [];
    let remaining = input;

    while (true) {
      const result = parseFn(remaining);
      if (!result) {
        break;
      }

      results.push(result.value);
      remaining = result.remaining;
    }

    return {
      remaining,
      value: results,
    };
  };
}

export function parseMatching(
  predicate: (char: string) => boolean,
): Parser<string> {
  return (input) => {
    if (input.length < 1) {
      return null;
    }

    const char = input[0];
    if (!predicate(char)) {
      return null;
    }

    return {
      remaining: input.slice(1),
      value: char,
    };
  };
}
