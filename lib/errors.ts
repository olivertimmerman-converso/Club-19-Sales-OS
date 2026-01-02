/**
 * Club 19 Sales OS - Error Handling Utilities
 *
 * Standardized error classes and handlers for consistent error handling
 */

import { NextResponse } from "next/server";
import { toErrorObject } from "./types/error";
import * as logger from "./logger";

/**
 * Base application error with additional context
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly context?: Record<string, unknown>;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    options: {
      statusCode?: number;
      code?: string;
      context?: Record<string, unknown>;
      isOperational?: boolean;
    } = {}
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = options.statusCode || 500;
    this.code = options.code || "INTERNAL_ERROR";
    this.context = options.context;
    this.isOperational = options.isOperational ?? true;

    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * API-specific error
 */
export class ApiError extends AppError {
  constructor(
    message: string,
    options: {
      statusCode?: number;
      code?: string;
      context?: Record<string, unknown>;
    } = {}
  ) {
    super(message, {
      ...options,
      statusCode: options.statusCode || 500,
      code: options.code || "API_ERROR",
    });
  }
}

/**
 * Authentication/Authorization error
 */
export class AuthError extends AppError {
  constructor(message: string = "Authentication required", context?: Record<string, unknown>) {
    super(message, {
      statusCode: 401,
      code: "AUTH_ERROR",
      context,
    });
  }
}

/**
 * Forbidden error (authenticated but not authorized)
 */
export class ForbiddenError extends AppError {
  constructor(message: string = "Access denied", context?: Record<string, unknown>) {
    super(message, {
      statusCode: 403,
      code: "FORBIDDEN",
      context,
    });
  }
}

/**
 * Validation error
 */
export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, {
      statusCode: 400,
      code: "VALIDATION_ERROR",
      context,
    });
  }
}

/**
 * Not found error
 */
export class NotFoundError extends AppError {
  constructor(resource: string = "Resource", context?: Record<string, unknown>) {
    super(`${resource} not found`, {
      statusCode: 404,
      code: "NOT_FOUND",
      context,
    });
  }
}

/**
 * External service error (Xero, Xata, etc.)
 */
export class ExternalServiceError extends AppError {
  constructor(
    service: string,
    message: string,
    context?: Record<string, unknown>
  ) {
    super(`${service} error: ${message}`, {
      statusCode: 502,
      code: "EXTERNAL_SERVICE_ERROR",
      context: { ...context, service },
    });
  }
}

/**
 * Rate limit error
 */
export class RateLimitError extends AppError {
  constructor(message: string = "Too many requests", context?: Record<string, unknown>) {
    super(message, {
      statusCode: 429,
      code: "RATE_LIMIT_EXCEEDED",
      context,
    });
  }
}

/**
 * Type guard to check if error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Create a standardized error response for API routes
 */
export function errorResponse(
  error: unknown,
  defaultMessage: string = "An error occurred"
): NextResponse {
  // Log the error
  logger.error("ERRORS", "Error response generated", { error: error as any } as any);

  // Handle AppError instances
  if (isAppError(error)) {
    return NextResponse.json(
      {
        error: error.code,
        message: error.message,
        ...(error.context && { context: error.context }),
      },
      { status: error.statusCode }
    );
  }

  // Handle standard Error instances
  if (error instanceof Error) {
    return NextResponse.json(
      {
        error: "INTERNAL_ERROR",
        message: error.message || defaultMessage,
      },
      { status: 500 }
    );
  }

  // Handle unknown errors
  return NextResponse.json(
    {
      error: "UNKNOWN_ERROR",
      message: defaultMessage,
      details: String(error),
    },
    { status: 500 }
  );
}

/**
 * Handle errors in API routes with logging and consistent response
 */
export function handleApiError(error: unknown, context: string): NextResponse {
  const errorObj = toErrorObject(error);

  logger.error("ERRORS", "API Error", {
    context,
    message: errorObj.message,
    stack: errorObj.stack
  });

  return errorResponse(error, `Failed to process request: ${context}`);
}

/**
 * Wrap async API route handler with error handling
 */
export function withErrorHandling<T extends unknown[]>(
  handler: (...args: T) => Promise<NextResponse>,
  context: string
) {
  return async (...args: T): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (error) {
      return handleApiError(error, context);
    }
  };
}

/**
 * Assert a condition or throw a ValidationError
 */
export function assert(
  condition: boolean,
  message: string,
  context?: Record<string, unknown>
): asserts condition {
  if (!condition) {
    throw new ValidationError(message, context);
  }
}

/**
 * Assert a value is not null/undefined or throw NotFoundError
 */
export function assertExists<T>(
  value: T | null | undefined,
  resource: string = "Resource",
  context?: Record<string, unknown>
): asserts value is T {
  if (value === null || value === undefined) {
    throw new NotFoundError(resource, context);
  }
}
