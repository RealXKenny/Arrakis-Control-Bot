/**
 * A tiny calculator for the chatbot: numbers, + - * / % ^ and parentheses, with the usual
 * precedence. It is a recursive-descent parser, so no `eval` and nothing else can run.
 */

type MathResult = { ok: true; value: number } | { ok: false; reason: "invalid" | "divideByZero" | "tooLarge" };

const MAX_DEPTH = 20;

function evaluateExpression(expression: string): MathResult {
  const tokens = expression.match(/\d+(?:\.\d+)?|\.\d+|[+\-*/%^()]|\S/g) ?? [];
  let position = 0;
  let depth = 0;
  let failure: "invalid" | "divideByZero" | null = null;

  const peek = (): string | undefined => tokens[position];
  const fail = (reason: "invalid" | "divideByZero" = "invalid"): number => {
    failure ??= reason;
    return Number.NaN;
  };

  function sum(): number {
    let value = product();
    while (peek() === "+" || peek() === "-") {
      const operator = tokens[position++];
      const right = product();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  }

  function product(): number {
    let value = power();
    while (peek() === "*" || peek() === "/" || peek() === "%") {
      const operator = tokens[position++];
      const right = power();
      if ((operator === "/" || operator === "%") && right === 0) return fail("divideByZero");
      value = operator === "*" ? value * right : operator === "/" ? value / right : value % right;
    }
    return value;
  }

  function power(): number {
    const base = unary();
    if (peek() !== "^") return base;
    position += 1;
    return base ** power();
  }

  function unary(): number {
    if (peek() === "-") {
      position += 1;
      return -unary();
    }
    if (peek() === "+") {
      position += 1;
      return unary();
    }
    return primary();
  }

  function primary(): number {
    const token = tokens[position++];
    if (token === undefined) return fail();
    if (token === "(") {
      depth += 1;
      if (depth > MAX_DEPTH) return fail();
      const value = sum();
      depth -= 1;
      if (tokens[position++] !== ")") return fail();
      return value;
    }
    const value = Number(token);
    return Number.isFinite(value) ? value : fail();
  }

  const value = sum();
  if (failure) return { ok: false, reason: failure };
  if (position !== tokens.length || Number.isNaN(value)) return { ok: false, reason: "invalid" };
  if (!Number.isFinite(value) || Math.abs(value) > 1e15) return { ok: false, reason: "tooLarge" };
  return { ok: true, value };
}

function formatNumber(value: number): string {
  const rounded = Number(value.toPrecision(12));
  return rounded.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

export { evaluateExpression, formatNumber };
export type { MathResult };
