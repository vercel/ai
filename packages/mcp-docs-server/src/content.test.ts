import { describe, it, expect, beforeAll } from 'vitest';
import { loadContent, searchDocs, getDoc, listDocs } from './content';

describe('content', () => {
  beforeAll(async () => {
    await loadContent();
  });

  describe('searchDocs', () => {
    it('should find docs matching query', () => {
      const results = searchDocs('streamText');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].relevance).toBe('high');
    });

    it('should respect limit parameter', () => {
      const results = searchDocs('generate', 3);
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('should return empty array for no matches', () => {
      const results = searchDocs('xyznonexistent123');
      expect(results).toEqual([]);
    });

    it('should include snippet in results', () => {
      const results = searchDocs('streamText');
      expect(results[0].snippet).toBeDefined();
      expect(results[0].snippet.length).toBeGreaterThan(0);
    });

    it('should return empty array for empty query', () => {
      expect(searchDocs('')).toEqual([]);
      expect(searchDocs('   ')).toEqual([]);
    });

    it('should cap limit at 20', () => {
      const results = searchDocs('the', 100);
      expect(results.length).toBeLessThanOrEqual(20);
    });

    it('should return empty array for negative limit', () => {
      const results = searchDocs('streamText', -5);
      expect(results).toEqual([]);
    });

    it('should handle special characters without crashing', () => {
      expect(() => searchDocs('(((((')).not.toThrow();
      expect(() => searchDocs('a]a]a]a]')).not.toThrow();
      expect(() => searchDocs('.*+?^${}()|[]\\/')).not.toThrow();
    });

    it('should truncate very long queries', () => {
      const longQuery = 'a'.repeat(1000);
      expect(() => searchDocs(longQuery)).not.toThrow();
    });
  });

  describe('getDoc', () => {
    it('should return doc content for valid path', () => {
      const result = getDoc('docs/03-ai-sdk-core/05-generating-text');
      expect(result).not.toBeNull();
      expect(result?.title).toBeDefined();
      expect(result?.content).toContain('streamText');
    });

    it('should return null for invalid path', () => {
      const result = getDoc('nonexistent/path');
      expect(result).toBeNull();
    });

    it('should handle pagination', () => {
      const page1 = getDoc(
        'docs/08-migration-guides/26-migration-guide-5-0',
        1,
      );
      expect(page1).not.toBeNull();
      expect(page1?.currentPage).toBe(1);
      if (page1 && page1.totalPages > 1) {
        const page2 = getDoc(
          'docs/08-migration-guides/26-migration-guide-5-0',
          2,
        );
        expect(page2?.currentPage).toBe(2);
      }
    });

    it('should normalize path with leading slash', () => {
      const result = getDoc('/docs/03-ai-sdk-core/05-generating-text');
      expect(result).not.toBeNull();
    });

    it('should return null for empty path', () => {
      expect(getDoc('')).toBeNull();
      expect(getDoc('   ')).toBeNull();
    });

    it('should strip .mdx extension from path', () => {
      const result = getDoc('docs/03-ai-sdk-core/05-generating-text.mdx');
      expect(result).not.toBeNull();
    });

    it('should clamp negative page to 1', () => {
      const result = getDoc('docs/03-ai-sdk-core/05-generating-text', -5);
      expect(result?.currentPage).toBe(1);
    });

    it('should clamp page beyond max to last page', () => {
      const result = getDoc('docs/03-ai-sdk-core/05-generating-text', 9999);
      expect(result?.currentPage).toBe(result?.totalPages);
    });

    it('should find doc by partial path suffix', () => {
      const result = getDoc('05-generating-text');
      expect(result).not.toBeNull();
      expect(result?.path).toContain('05-generating-text');
    });
  });

  describe('listDocs', () => {
    it('should list all docs when no section specified', () => {
      const result = listDocs();
      expect(result.count).toBeGreaterThan(0);
      expect(result.docs.length).toBe(result.count);
    });

    it('should filter by section', () => {
      const result = listDocs('cookbook');
      expect(result.section).toBe('cookbook');
      expect(result.docs.every(d => d.path.startsWith('cookbook'))).toBe(true);
    });

    it('should include title and description', () => {
      const result = listDocs('docs');
      expect(result.docs[0].title).toBeDefined();
      expect(result.docs[0].path).toBeDefined();
    });

    it('should return empty list for non-existent section', () => {
      const result = listDocs('nonexistent');
      expect(result.count).toBe(0);
      expect(result.docs).toEqual([]);
    });
  });
});
