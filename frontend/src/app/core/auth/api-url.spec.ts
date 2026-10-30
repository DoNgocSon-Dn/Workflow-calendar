import { describe, expect, it } from 'vitest';
import { isApiRequest } from './api-url';

describe('API request boundary', () => {
  it('accepts API routes and query strings on the configured origin', () => {
    expect(isApiRequest('https://api.example.com/events?q=hop', 'https://api.example.com/')).toBe(true);
    expect(isApiRequest('https://api.example.com/v1/events', 'https://api.example.com/v1/')).toBe(true);
    expect(isApiRequest('https://api.example.com/v1?q=a', 'https://api.example.com/v1')).toBe(true);
  });
  it('does not leak tokens to a hostname that only starts with the API URL', () => {
    expect(isApiRequest('https://api.example.com.evil.test/events', 'https://api.example.com')).toBe(false);
    expect(isApiRequest('https://api.example.com@evil.test/events', 'https://api.example.com')).toBe(false);
    expect(isApiRequest('https://api.example.com:8443/events', 'https://api.example.com')).toBe(false);
    expect(isApiRequest('http://api.example.com/events', 'https://api.example.com')).toBe(false);
  });
  it('respects path boundaries and rejects malformed or credential-bearing URLs', () => {
    expect(isApiRequest('https://api.example.com/v10/events', 'https://api.example.com/v1')).toBe(false);
    expect(isApiRequest('https://name:password@api.example.com/events', 'https://api.example.com')).toBe(false);
    expect(isApiRequest('not-a-url', 'https://api.example.com')).toBe(false);
    expect(isApiRequest('file:///events', 'file:///')).toBe(false);
  });
});
