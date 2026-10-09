import "server-only";
import bcrypt from "bcryptjs";

const COST = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

let dummyHash: Promise<string> | null = null;

/**
 * Verify a password. Pass `null` as the hash when the user does not exist — a dummy hash is
 * compared instead so the response time does not reveal whether an account exists.
 */
export async function verifyPassword(plain: string, hash: string | null): Promise<boolean> {
  if (hash === null) {
    dummyHash ??= bcrypt.hash("timing-equaliser-not-a-real-password", COST);
    await bcrypt.compare(plain, await dummyHash);
    return false;
  }
  return bcrypt.compare(plain, hash);
}
