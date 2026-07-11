/** Input, options, or caller-supplied reference object failed Section 26.2.2 validation. */
export class TEValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TEValidationError";
  }
}

/**
 * The bundled reference object is missing or invalid (Section 26.4.1).
 * Fatal: never degrades to percentile 50.
 */
export class TEConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TEConfigurationError";
  }
}
