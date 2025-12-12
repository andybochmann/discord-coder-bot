# GitHub Copilot Instructions

This file contains guidelines and best practices for developing this TypeScript application. Copilot and contributors must follow these rules when writing or modifying code.

---

## TypeScript Configuration

### Strict Mode

- **Always enable strict mode** in `tsconfig.json`
- Required compiler options:
  ```json
  {
    "compilerOptions": {
      "strict": true,
      "noImplicitAny": true,
      "strictNullChecks": true,
      "strictFunctionTypes": true,
      "strictBindCallApply": true,
      "strictPropertyInitialization": true,
      "noImplicitThis": true,
      "alwaysStrict": true,
      "noUnusedLocals": true,
      "noUnusedParameters": true,
      "noImplicitReturns": true,
      "noFallthroughCasesInSwitch": true,
      "noUncheckedIndexedAccess": true
    }
  }
  ```

### Type Safety

- Never use `any` type unless absolutely necessary; prefer `unknown` when type is uncertain
- Always define explicit return types for functions
- Use type guards and narrowing instead of type assertions
- Prefer interfaces for object shapes; use types for unions, intersections, and mapped types
- Use `readonly` for properties that should not be modified
- Avoid non-null assertions (`!`); handle null/undefined explicitly

---

## Code Documentation

### JSDoc Requirements

- **Every exported function, class, interface, and type must have JSDoc documentation**
- Include the following in JSDoc comments:
  - `@description` - Brief explanation of what it does
  - `@param` - For each parameter with type and description
  - `@returns` - Return value description
  - `@throws` - Document any exceptions that may be thrown
  - `@example` - Provide usage examples for complex functions

### Documentation Standards

```typescript
/**
 * Calculates the sum of two numbers.
 *
 * @param a - The first number to add
 * @param b - The second number to add
 * @returns The sum of a and b
 * @throws {RangeError} If either number exceeds safe integer limits
 *
 * @example
 * const result = add(2, 3);
 * console.log(result); // 5
 */
export function add(a: number, b: number): number {
  // implementation
}
```

### Inline Comments

- Use inline comments to explain **why**, not **what**
- Complex algorithms must have step-by-step explanations
- Mark TODOs with `// TODO:` and include context

---

## Unit Testing

### Testing Requirements

- **Every feature must have corresponding unit tests**
- Aim for **minimum 80% code coverage**
- Test files must be co-located or in a `__tests__` directory
- Use descriptive test names that explain the expected behavior

### Testing Best Practices

- Follow the **Arrange-Act-Assert** pattern
- Test both success and failure paths
- Mock external dependencies (APIs, databases, file system)
- Write tests before or alongside implementation (TDD encouraged)
- Each test should be independent and not rely on other tests

### Test Naming Convention

```typescript
describe("FunctionName", () => {
  it("should return expected result when given valid input", () => {
    // test implementation
  });

  it("should throw an error when given invalid input", () => {
    // test implementation
  });
});
```

---

## Code Style & Conventions

### Naming Conventions

- **Variables and functions**: camelCase
- **Classes and interfaces**: PascalCase
- **Constants**: UPPER_SNAKE_CASE
- **Private members**: prefix with underscore `_privateMember`
- **Boolean variables**: prefix with `is`, `has`, `should`, `can`
- **Files**: kebab-case for files, PascalCase for class files

### Function Guidelines

- Functions should do one thing and do it well (Single Responsibility)
- Maximum function length: ~50 lines (prefer smaller)
- Maximum parameters: 3 (use an options object for more)
- Prefer pure functions where possible
- Use arrow functions for callbacks and short functions

### Error Handling

- Always use typed errors or custom error classes
- Never swallow errors silently
- Provide meaningful error messages with context
- Use try-catch at appropriate boundaries

---

## Architecture & Patterns

### Module Organization

- One class/component per file
- Group related functionality in directories
- Use barrel exports (`index.ts`) for clean imports
- Separate concerns: business logic, data access, presentation

### Dependency Injection

- Prefer constructor injection for dependencies
- Use interfaces for external dependencies to enable testing
- Avoid global state and singletons where possible

### Async/Await

- Always use async/await over raw promises
- Handle errors with try-catch in async functions
- Avoid mixing callbacks with promises
- Use `Promise.all()` for concurrent operations

---

## Security Best Practices

- Never hardcode secrets, API keys, or credentials
- Validate and sanitize all external inputs
- Use environment variables for configuration
- Implement proper authentication and authorization checks
- Log security-relevant events without exposing sensitive data

---

## Git & Version Control

- Write meaningful commit messages
- Keep commits atomic and focused
- Branch naming: `feature/`, `bugfix/`, `hotfix/`, `chore/`
- Always create pull requests for code review

---

## Performance Considerations

- Avoid premature optimization, but be mindful of obvious inefficiencies
- Use appropriate data structures for the use case
- Implement pagination for large data sets
- Cache expensive computations when appropriate
- Profile before optimizing

---

## Reminders for Copilot

When generating code:

1. ✅ Always include proper TypeScript types
2. ✅ Add JSDoc documentation for all exports
3. ✅ Suggest or generate corresponding unit tests
4. ✅ Follow the naming conventions above
5. ✅ Handle errors explicitly
6. ❌ Never use `any` without justification
7. ❌ Never ignore potential null/undefined values
8. ❌ Never generate code without considering edge cases
