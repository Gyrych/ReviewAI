import { describe, it, expect } from 'vitest';
import { parseResponse } from '../src/services/responseParser';

describe('responseParser', () => {
  it('parses string responses and extracts urls', () => {
    const input = 'See https://example.com and http://test.local/page';
    const parsed = parseResponse(input as any);
    expect(parsed.citations.length).toBe(2);
    expect(parsed.text).toContain('https://example.com');
  });

  it('parses object with citations field', () => {
    const input = { text: 'hello', citations: [{ url: 'https://a.com', title: 'A' }] };
    const parsed = parseResponse(input as any);
    expect(parsed.citations.length).toBe(1);
    expect(parsed.citations[0].url).toBe('https://a.com');
  });
});


