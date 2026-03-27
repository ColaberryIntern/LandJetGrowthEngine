import {
  AppError,
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
} from '../../middleware/errors';

describe('Custom Error Classes', () => {
  it('should create AppError with correct properties', () => {
    const error = new AppError('test error', 500, 'TEST_ERROR');
    expect(error.message).toBe('test error');
    expect(error.statusCode).toBe(500);
    expect(error.code).toBe('TEST_ERROR');
    expect(error instanceof Error).toBe(true);
  });

  it('should create AuthenticationError with 401', () => {
    const error = new AuthenticationError();
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe('AUTHENTICATION_ERROR');
    expect(error.message).toBe('Authentication required');
  });

  it('should create AuthorizationError with 403', () => {
    const error = new AuthorizationError();
    expect(error.statusCode).toBe(403);
    expect(error.code).toBe('AUTHORIZATION_ERROR');
  });

  it('should create ValidationError with 400', () => {
    const error = new ValidationError('bad input');
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe('bad input');
  });

  it('should create NotFoundError with 404', () => {
    const error = new NotFoundError();
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
  });

  it('should create ConflictError with 409', () => {
    const error = new ConflictError();
    expect(error.statusCode).toBe(409);
  });

  it('should create RateLimitError with 429', () => {
    const error = new RateLimitError();
    expect(error.statusCode).toBe(429);
    expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
  });
});
