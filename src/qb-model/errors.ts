/** Input, options, scoring, or caller-supplied reference object failed validation. */
export class QBValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QBValidationError";
  }
}
