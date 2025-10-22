import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useResearchDB } from '@/hooks/useResearchDB'
import { getResearchDB } from '@/lib/database'

// Mock the database module
vi.mock('@/lib/database', () => ({
  getResearchDB: vi.fn()
}))

describe('useResearchDB', () => {
  const mockDB = {
    insert: vi.fn(),
    getAll: vi.fn(),
    search: vi.fn(),
    find: vi.fn(),
    delete: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(getResearchDB as any).mockResolvedValue(mockDB)

    // Mock crypto.randomUUID
    Object.defineProperty(global, 'crypto', {
      value: {
        randomUUID: vi.fn(() => 'test-uuid-123')
      }
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('initialization', () => {
    it('should initialize database and set loading states', async () => {
      const { result } = renderHook(() => useResearchDB())

      // Initial state
      expect(result.current.isLoading).toBe(true)
      expect(result.current.error).toBeNull()

      // Wait for initialization
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(getResearchDB).toHaveBeenCalled()
    })

    it('should handle initialization errors', async () => {
      ;(getResearchDB as any).mockRejectedValue(new Error('Database init failed'))

      const { result } = renderHook(() => useResearchDB())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
        expect(result.current.error).toBe('Database init failed')
      })
    })
  })

  describe('addPaper', () => {
    it('should add a paper successfully', async () => {
      mockDB.insert.mockResolvedValue({ id: 'test-uuid-123' })

      const { result } = renderHook(() => useResearchDB())
      await waitFor(() => expect(result.current.isLoading).toBe(false))

      const paperData = {
        title: 'Test Paper',
        authors: 'Test Author',
        abstract: 'Test abstract',
        publicationDate: new Date('2024-01-01'),
        tags: 'test, paper'
      }

      const resultPaper = await result.current.addPaper(paperData)

      expect(mockDB.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-uuid-123',
          title: 'Test Paper',
          authors: 'Test Author',
          abstract: 'Test abstract',
          tags: 'test, paper'
        }),
        'papers'
      )

      expect(resultPaper.id).toBe('test-uuid-123')
    })

    it('should handle array authors and tags', async () => {
      mockDB.insert.mockResolvedValue({ id: 'test-uuid-123' })

      const { result } = renderHook(() => useResearchDB())
      await waitFor(() => expect(result.current.isLoading).toBe(false))

      const paperData = {
        title: 'Test Paper',
        authors: ['Author 1', 'Author 2'],
        abstract: 'Test abstract',
        publicationDate: new Date('2024-01-01'),
        tags: ['tag1', 'tag2']
      }

      await result.current.addPaper(paperData)

      expect(mockDB.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          authors: 'Author 1, Author 2',
          tags: 'tag1, tag2'
        }),
        'papers'
      )
    })

    it('should handle database errors', async () => {
      mockDB.insert.mockRejectedValue(new Error('Insert failed'))

      const { result } = renderHook(() => useResearchDB())
      await waitFor(() => expect(result.current.isLoading).toBe(false))

      const paperData = {
        title: 'Test Paper',
        authors: 'Test Author',
        abstract: 'Test abstract',
        publicationDate: new Date('2024-01-01'),
        tags: 'test, paper'
      }

      await expect(result.current.addPaper(paperData)).rejects.toThrow('Insert failed')
    })
  })

  describe('addNote', () => {
    it('should add a note successfully', async () => {
      mockDB.insert.mockResolvedValue({ id: 'test-uuid-123' })

      const { result } = renderHook(() => useResearchDB())
      await waitFor(() => expect(result.current.isLoading).toBe(false))

      const noteData = {
        content: 'Test note content',
        tags: ['test', 'note'],
        paperId: 'paper-123'
      }

      const resultNote = await result.current.addNote(noteData)

      expect(mockDB.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-uuid-123',
          content: 'Test note content',
          tags: ['test', 'note'],
          paperId: 'paper-123'
        }),
        'notes'
      )

      expect(resultNote.id).toBe('test-uuid-123')
    })
  })

  describe('searchPapers', () => {
    it('should search papers successfully', async () => {
      const mockResults = [
        { id: '1', title: 'Machine Learning Paper', abstract: 'About ML' },
        { id: '2', title: 'AI Research', abstract: 'About AI' }
      ]
      mockDB.search.mockResolvedValue(mockResults)

      const { result } = renderHook(() => useResearchDB())
      await waitFor(() => expect(result.current.isLoading).toBe(false))

      const searchResults = await result.current.searchPapers('machine learning')

      expect(mockDB.search).toHaveBeenCalledWith('machine learning', {
        table: 'papers'
      })
      expect(searchResults).toEqual(mockResults)
    })

    it('should fallback to manual search when search method fails', async () => {
      mockDB.search.mockResolvedValue([])
      mockDB.getAll.mockResolvedValue([
        { id: '1', title: 'Machine Learning Paper', abstract: 'About ML' },
        { id: '2', title: 'AI Research', abstract: 'About AI' }
      ])

      const { result } = renderHook(() => useResearchDB())
      await waitFor(() => expect(result.current.isLoading).toBe(false))

      const searchResults = await result.current.searchPapers('machine')

      expect(searchResults).toHaveLength(1)
      expect(searchResults[0].title).toBe('Machine Learning Paper')
    })
  })

  describe('getAllPapers', () => {
    it('should fetch all papers', async () => {
      const mockPapers = [
        { id: '1', title: 'Paper 1' },
        { id: '2', title: 'Paper 2' }
      ]
      mockDB.getAll.mockResolvedValue(mockPapers)

      const { result } = renderHook(() => useResearchDB())
      await waitFor(() => expect(result.current.isLoading).toBe(false))

      const papers = await result.current.getAllPapers()

      expect(mockDB.getAll).toHaveBeenCalledWith('papers')
      expect(papers).toEqual(mockPapers)
    })
  })

  describe('deletePaper', () => {
    it('should delete a paper successfully', async () => {
      mockDB.delete.mockResolvedValue(undefined)

      const { result } = renderHook(() => useResearchDB())
      await waitFor(() => expect(result.current.isLoading).toBe(false))

      await result.current.deletePaper('paper-123')

      expect(mockDB.delete).toHaveBeenCalledWith('paper-123', 'papers')
    })
  })
})