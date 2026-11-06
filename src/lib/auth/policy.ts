// What counts as a usable sign-in configuration. Pure (takes the values, reads
// no environment), so the rules can be unit-tested.

export const MIN_PASSWORD_LENGTH = 12;
export const MIN_SECRET_LENGTH = 32;

/** The placeholders in .env.example. Deploying them unchanged must not work. */
const EXAMPLE_VALUES = new Set([
  "replace-with-a-long-unique-password",
  "replace-with-at-least-32-random-characters",
]);

export function authSettingProblems(username: string, password: string, secret: string): string[] {
  const problems: string[] = [];
  if (!username) problems.push("APP_USERNAME is not set");

  if (!password) problems.push("APP_PASSWORD is not set");
  else if (EXAMPLE_VALUES.has(password)) problems.push("APP_PASSWORD is still the example value from .env.example");
  else if (password.length < MIN_PASSWORD_LENGTH) problems.push(`APP_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters`);
  else if (password === username) problems.push("APP_PASSWORD must not be the same as APP_USERNAME");

  if (!secret) problems.push("SESSION_SECRET is not set");
  else if (EXAMPLE_VALUES.has(secret)) problems.push("SESSION_SECRET is still the example value from .env.example");
  else if (secret.length < MIN_SECRET_LENGTH) problems.push(`SESSION_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
  else if (secret === password) problems.push("SESSION_SECRET must not be the same as APP_PASSWORD");

  return problems;
}
