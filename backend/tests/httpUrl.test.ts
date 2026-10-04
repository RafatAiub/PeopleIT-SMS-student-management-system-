import { httpUrl } from '../src/utils/url';

describe('httpUrl', () => {
  const schema = httpUrl();

  it('accepts http and https URLs', () => {
    expect(schema.safeParse('https://example.com/file.pdf').success).toBe(true);
    expect(schema.safeParse('http://example.com/file.pdf').success).toBe(true);
  });

  it('rejects javascript: URLs (XSS vector)', () => {
    const result = schema.safeParse('javascript:alert(1)');
    expect(result.success).toBe(false);
  });

  it('rejects data: URLs', () => {
    const result = schema.safeParse('data:text/html,<script>alert(1)</script>');
    expect(result.success).toBe(false);
  });

  it('rejects vbscript: URLs', () => {
    expect(schema.safeParse('vbscript:msgbox(1)').success).toBe(false);
  });

  it('rejects malformed URLs', () => {
    expect(schema.safeParse('not-a-url').success).toBe(false);
  });

  it('works within optional/nullable chains', () => {
    const optionalSchema = httpUrl().optional().nullable();
    expect(optionalSchema.safeParse(undefined).success).toBe(true);
    expect(optionalSchema.safeParse(null).success).toBe(true);
    expect(optionalSchema.safeParse('javascript:alert(1)').success).toBe(false);
    expect(optionalSchema.safeParse('https://good.example/x.png').success).toBe(true);
  });
});
