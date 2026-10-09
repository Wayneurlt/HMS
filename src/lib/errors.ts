/** Errors with a user-facing message. Thrown from services/actions; mapped to ActionResult. */
export class ActionError extends Error {
  constructor(
    message: string,
    public fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ActionError";
  }
}

export class AuthError extends ActionError {
  constructor(message = "You do not have permission to do that.") {
    super(message);
    this.name = "AuthError";
  }
}
