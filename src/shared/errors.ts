export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, id: number | string) {
    super(`${entity} ${id} not found`, "NOT_FOUND");
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR");
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, public readonly cause: unknown) {
    super(message, "DATABASE_ERROR");
  }
}
